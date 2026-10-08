import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ReactMarkdown from "react-markdown";
import type { Message } from "@langchain/langgraph-sdk";
import { CitationTurn, useCitationMarkdown } from "./citations-view";

const { requestApi } = vi.hoisted(() => ({ requestApi: vi.fn() }));
vi.mock("@/providers/Stream", () => ({
  useStreamContext: () => ({ requestApi }),
}));

const sources = [
  {
    cite: "first",
    document_id: "doc",
    compname: "ABC Limited",
    subcatname: "annual-report",
    attachment_name: "annual report.pdf",
    page: 8,
    quote: "Later passage",
  },
  {
    cite: "second",
    document_id: "doc",
    compname: "ABC Limited",
    subcatname: "annual-report",
    attachment_name: "annual report.pdf",
    page: 3,
    quote: "Earlier passage",
  },
];
const messages: Message[] = [
  {
    type: "tool",
    content: "{}",
    additional_kwargs: { citations: sources },
  } as unknown as Message,
  { type: "ai", content: "A finding [[first]]" },
];
function Prose() {
  const markdown = useCitationMarkdown("A finding [[first]]");
  return (
    <ReactMarkdown components={markdown.components}>
      {markdown.text}
    </ReactMarkdown>
  );
}

describe("citation presentation and recovery", () => {
  beforeEach(() => {
    requestApi.mockReset();
    requestApi.mockRejectedValue(new Error("offline"));
  });

  it("keeps inline provenance available during streaming and shows sources only after settling", () => {
    const { rerender } = render(
      <CitationTurn
        messages={messages}
        settled={false}
      >
        <Prose />
      </CitationTurn>,
    );
    expect(
      screen.getByRole("button", { name: /source 1/i }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Sources")).not.toBeInTheDocument();
    rerender(
      <CitationTurn
        messages={messages}
        settled
      >
        <Prose />
      </CitationTurn>,
    );
    expect(screen.getByText("Sources")).toBeInTheDocument();
    expect(screen.getByText(/Pages 3, 8/)).toBeInTheDocument();
  });

  it("opens the cited passage immediately, fetches the exact authenticated route, and recovers a failed document", async () => {
    const user = userEvent.setup();
    render(
      <CitationTurn
        messages={messages}
        settled
      >
        <Prose />
      </CitationTurn>,
    );
    await user.click(screen.getByRole("button", { name: /source 1/i }));
    expect(screen.getByText("Later passage")).toBeInTheDocument();
    expect(screen.getByText("Passage 2 of 2")).toBeInTheDocument();
    await waitFor(() =>
      expect(requestApi).toHaveBeenCalledWith(
        "/api/filings/pdf?subcatname=annual-report&attachment_name=annual+report.pdf",
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      ),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The source document could not be opened",
    );
    await user.click(
      screen.getByRole("button", { name: /previous source passage/i }),
    );
    expect(screen.getByText("Earlier passage")).toBeInTheDocument();
    expect(requestApi).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(requestApi).toHaveBeenCalledTimes(2));
  });
});
