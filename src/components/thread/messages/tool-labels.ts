// Friendly labels from FinSharpe-Mobile's production tool_copy.dart.
const TOOL_LABELS: Record<string, { name: string; active: string }> = {
  call_api: {
    name: "Gather financial data",
    active: "Gathering financial data",
  },
  search_endpoints: {
    name: "Find relevant data sources",
    active: "Finding relevant data sources",
  },
  get_endpoint_spec: {
    name: "Review available data",
    active: "Reviewing available data",
  },
  resolve_symbols: {
    name: "Match stock symbols",
    active: "Matching stock symbols",
  },
  scan: { name: "Scan the market", active: "Scanning the market" },
  scan_by_fundamentals: {
    name: "Scan stock fundamentals",
    active: "Scanning stock fundamentals",
  },
  search_analytics: {
    name: "Find relevant analytics",
    active: "Finding relevant analytics",
  },
  get_analytics: {
    name: "Fetch market analytics",
    active: "Fetching market analytics",
  },
  search_prebuilt_scanners: {
    name: "Find ready-made stock scans",
    active: "Finding ready-made stock scans",
  },
  search_specialized_scanners: {
    name: "Find specialized stock scans",
    active: "Finding specialized stock scans",
  },
  search_scanner_ratios: {
    name: "Look up screening ratios",
    active: "Looking up screening ratios",
  },
  get_pattern_catalog: {
    name: "Review chart patterns",
    active: "Reviewing chart patterns",
  },
  get_indicator_conditions: {
    name: "Review technical indicator conditions",
    active: "Reviewing technical indicator conditions",
  },
  get_system_builders: {
    name: "Find trading systems",
    active: "Finding trading systems",
  },
  get_system_builder_by_id: {
    name: "Read trading system details",
    active: "Reading trading system details",
  },
  get_market_overview: {
    name: "Check the market overview",
    active: "Checking the market overview",
  },
  get_scheme_details: {
    name: "Read mutual fund details",
    active: "Reading mutual fund details",
  },
  mf_portfolio_history: {
    name: "Read fund portfolios",
    active: "Reading fund portfolios",
  },
  mf_stock_ownership: {
    name: "Check which funds hold the stock",
    active: "Checking which funds hold the stock",
  },
  list_ipos: {
    name: "Check the IPO calendar",
    active: "Checking the IPO calendar",
  },
  get_ipo_overview: { name: "Read IPO details", active: "Reading IPO details" },
  search_prospectus: {
    name: "Search the prospectus",
    active: "Searching the prospectus",
  },
  find_predefined_groups: {
    name: "Find stock groups",
    active: "Finding stock groups",
  },
  render_stock_report: {
    name: "Build the stock report",
    active: "Building the stock report",
  },
  render_mf_report: {
    name: "Build the mutual fund report",
    active: "Building the mutual fund report",
  },
  render_portfolio_report: {
    name: "Build the portfolio report",
    active: "Building the portfolio report",
  },
  search_filings: {
    name: "Search company filings",
    active: "Searching company filings",
  },
  get_filing_text: {
    name: "Read the company filing",
    active: "Reading the company filing",
  },
  get_filing_pdf: {
    name: "Fetch the filing PDF",
    active: "Fetching the filing PDF",
  },
  list_filing_sectors: {
    name: "Find filing sectors",
    active: "Finding filing sectors",
  },
  screen_equities: { name: "Screen stocks", active: "Screening stocks" },
  screen_mutual_funds: {
    name: "Screen mutual funds",
    active: "Screening mutual funds",
  },
  resolve_equity_symbols: {
    name: "Match stocks for screening",
    active: "Matching stocks for screening",
  },
  resolve_mf_schemes: {
    name: "Search for matching mutual funds",
    active: "Finding matching mutual funds",
  },
  list_columns: {
    name: "Review screening fields",
    active: "Reviewing screening fields",
  },
  list_equity_industries: {
    name: "Find stock industries",
    active: "Finding stock industries",
  },
  list_strategies: {
    name: "Find screening strategies",
    active: "Finding screening strategies",
  },
  get_strategy: {
    name: "Read the screening strategy",
    active: "Reading the screening strategy",
  },
  compute_covariance_matrix: {
    name: "Calculate how returns move together",
    active: "Calculating how returns move together",
  },
  compute_efficient_frontier: {
    name: "Map portfolio risk and return",
    active: "Mapping portfolio risk and return",
  },
  compute_return_metrics: {
    name: "Calculate portfolio returns",
    active: "Calculating portfolio returns",
  },
  compute_risk_contributions: {
    name: "Measure each holding’s risk contribution",
    active: "Measuring each holding’s risk contribution",
  },
  compute_rolling_return_metrics: {
    name: "Calculate rolling returns",
    active: "Calculating rolling returns",
  },
  optimize_dr_cvar: {
    name: "Optimize for worst-case loss risk",
    active: "Optimizing for worst-case loss risk",
  },
  optimize_equal_weighted: {
    name: "Build an equal-weight portfolio",
    active: "Building an equal-weight portfolio",
  },
  optimize_herc: {
    name: "Balance risk across portfolio clusters",
    active: "Balancing risk across portfolio clusters",
  },
  optimize_hrp: {
    name: "Allocate with hierarchical risk parity",
    active: "Allocating with hierarchical risk parity",
  },
  optimize_inverse_volatility: {
    name: "Weight holdings by inverse volatility",
    active: "Weighting holdings by inverse volatility",
  },
  optimize_max_diversification: {
    name: "Optimize portfolio diversification",
    active: "Optimizing portfolio diversification",
  },
  optimize_mean_risk: {
    name: "Balance expected return and risk",
    active: "Balancing expected return and risk",
  },
  optimize_nco: {
    name: "Optimize within portfolio clusters",
    active: "Optimizing within portfolio clusters",
  },
  optimize_random: {
    name: "Build a random-weight baseline",
    active: "Building a random-weight baseline",
  },
  optimize_risk_budgeting: {
    name: "Allocate the portfolio risk budget",
    active: "Allocating the portfolio risk budget",
  },
  optimize_stacking: {
    name: "Combine portfolio allocations",
    active: "Combining portfolio allocations",
  },
  probe_data_coverage: {
    name: "Check historical data coverage",
    active: "Checking historical data coverage",
  },
  resolve_datafeeder_symbol: {
    name: "Match symbols for historical data",
    active: "Matching symbols for historical data",
  },
  simulate_path: {
    name: "Simulate a portfolio path",
    active: "Simulating a portfolio path",
  },
  backtest_signal_strategy: {
    name: "Backtest the signal strategy",
    active: "Backtesting the signal strategy",
  },
  backtest_optimizer_strategy: {
    name: "Backtest the portfolio strategy",
    active: "Backtesting the portfolio strategy",
  },
  compare_backtest_strategies: {
    name: "Compare strategy backtests",
    active: "Comparing strategy backtests",
  },
  compare_cv_runs: {
    name: "Compare strategy validation runs",
    active: "Comparing strategy validation runs",
  },
  get_backtest_run: {
    name: "Read saved backtest results",
    active: "Reading saved backtest results",
  },
  walk_forward_cv: {
    name: "Test across successive time windows",
    active: "Testing across successive time windows",
  },
  render_optimizer_dashboard: {
    name: "Build the portfolio backtest dashboard",
    active: "Building the portfolio backtest dashboard",
  },
  render_signal_trade_inspector: {
    name: "Build the trade breakdown",
    active: "Building the trade breakdown",
  },
  render_cv_robustness_card: {
    name: "Build the strategy validation report",
    active: "Building the strategy validation report",
  },
  opstra_option_chain: {
    name: "Read the option chain",
    active: "Reading the option chain",
  },
  opstra_payoff: {
    name: "Calculate the options payoff",
    active: "Calculating the options payoff",
  },
  opstra_simulated_payoff: {
    name: "Simulate the historical options payoff",
    active: "Simulating the historical options payoff",
  },
  opstra_find_strategies: {
    name: "Find options strategies",
    active: "Finding options strategies",
  },
  opstra_strategy_screener: {
    name: "Screen options strategies",
    active: "Screening options strategies",
  },
  opstra_market_positioning: {
    name: "Read derivatives market positioning",
    active: "Reading derivatives market positioning",
  },
  opstra_institutional_flows: {
    name: "Read institutional flows",
    active: "Reading institutional flows",
  },
  retrieve_tools: {
    name: "Prepare the research tools",
    active: "Preparing the research tools",
  },
  get_pipeline_run: {
    name: "Read the research report",
    active: "Reading the research report",
  },
  get_user_portfolio: {
    name: "Read your portfolio",
    active: "Reading your portfolio",
  },
  analyze_user_portfolio: {
    name: "Analyze your portfolio",
    active: "Analyzing your portfolio",
  },
};

const ACRONYMS = new Set([
  "api",
  "id",
  "url",
  "sdk",
  "mf",
  "etf",
  "sip",
  "nav",
  "isin",
  "ipo",
]);
const CONNECTORS = new Set([
  "by",
  "of",
  "to",
  "for",
  "and",
  "in",
  "on",
  "at",
  "the",
  "a",
  "an",
]);

export function toolNoun(name: string, fallback = "Report"): string {
  const words = name
    .trim()
    .replace(/^render_/, "")
    .split(/[_\s]+/)
    .filter(Boolean);
  return (
    words
      .map((word, index) => {
        const lower = word.toLowerCase();
        return ACRONYMS.has(lower)
          ? lower.toUpperCase()
          : index === 0
            ? lower.charAt(0).toUpperCase() + lower.slice(1)
            : lower;
      })
      .join(" ") || fallback
  );
}

export function formatToolName(name: string, active = false): string {
  if (TOOL_LABELS[name]) return TOOL_LABELS[name][active ? "active" : "name"];
  const cleaned = name.trim();
  if (!cleaned) return active ? "Retrieving data" : "Retrieve data";
  if (cleaned.startsWith("render_"))
    return `${active ? "Building" : "Build"} the ${toolNoun(cleaned)}`;
  return cleaned
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((word, index) => {
      const lower = word.toLowerCase();
      if (ACRONYMS.has(lower)) return lower.toUpperCase();
      if (index > 0 && CONNECTORS.has(lower)) return lower;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(" ");
}
