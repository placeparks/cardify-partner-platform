import { CodeExample } from './code-example'

const endpoint = 'https://www.tcgplaytest.com/api/mcp'

export function McpGuide() {
  return <section className="space-y-4">
    <p>Ask an AI assistant to prepare printed cards, review a private preview, then pay through guest checkout. You do not need a TCGPlaytest account, partner application or API key to use the public MCP server.</p>

    <h2>Connect your assistant</h2>
    <ol className="list-decimal space-y-2 pl-6">
      <li>Open the server or connector settings in a client that supports remote MCP.</li>
      <li>Add <code>{endpoint}</code> as the server URL. Choose <strong>Streamable HTTP</strong> if asked for the transport.</li>
      <li>Choose <strong>No authentication</strong>. Leave the API key and Authorization header empty.</li>
    </ol>
    <p>Your assistant&apos;s own account or plan may affect whether it supports custom MCP servers. Opening the endpoint in a browser returns HTTP 405 because it is a tool endpoint, not a webpage.</p>
    <CodeExample label="MCP server URL">{endpoint}</CodeExample>
    <p>Use the <strong>www</strong> URL above directly; some clients do not follow redirects from the non-www address. Your AI provider&apos;s account, plan and usage charges are separate from TCGPlaytest checkout.</p>

    <h2 id="mcp--platforms">Choose your platform</h2>
    <p>Setup steps checked against official platform documentation on October 20, 2026. Menus and availability can vary by account or workspace policy.</p>
    <nav aria-label="MCP platform setup" className="flex flex-wrap gap-x-5 gap-y-2">
      <a href="#mcp--chatgpt">ChatGPT</a><a href="#mcp--claude">Claude</a><a href="#mcp--gemini">Gemini</a><a href="#mcp--codex">Codex</a><a href="#mcp--claude-code">Claude Code</a><a href="#mcp--gemini-cli">Gemini CLI</a><a href="#mcp--cursor">Cursor</a><a href="#mcp--openai-api">OpenAI API</a><a href="#mcp--first-order">Try your first order</a>
    </nav>

    <h3 id="mcp--chatgpt">ChatGPT</h3>
    <ol className="list-decimal space-y-2 pl-6">
      <li>Open ChatGPT&apos;s <strong>Plugins</strong> page, select <strong>+</strong>, then <strong>Add custom MCP server</strong>.</li>
      <li>Name it <strong>TCGPlaytest</strong>. Describe it as “Card printing estimates, artwork previews and guest checkout.” Choose the public URL connection and paste the server URL above.</li>
      <li>Select no authentication, review the connection notice, then choose <strong>Create as a plugin</strong>.</li>
      <li>Install the resulting plugin. Start a conversation, type <strong>@</strong> and select TCGPlaytest before requesting an estimate.</li>
    </ol>
    <p>If custom servers are unavailable, check your account or workspace policy. Follow <a href="https://developers.openai.com/plugins/deploy/connect-chatgpt">OpenAI&apos;s current connection guide</a> for your interface. Creating this personal connection does not publish TCGPlaytest in the plugin directory.</p>

    <h3 id="mcp--claude">Claude · web and desktop</h3>
    <ol className="list-decimal space-y-2 pl-6">
      <li>Open <strong>Customize → Connectors → + Add → Add custom connector</strong>.</li>
      <li>Use the name <strong>TCGPlaytest</strong>, paste the server URL above and continue.</li>
      <li>Review the detected settings, choose <strong>No sign in</strong> and leave request headers empty. Finish with <strong>Add</strong>.</li>
      <li>In a conversation, open <strong>+ → Connectors</strong> and enable TCGPlaytest.</li>
    </ol>
    <p>On Team or Enterprise, an authorized owner first adds it under <strong>Organization settings → Connectors → Add → Custom → Web</strong>; members then enable it. Remote connectors connect from Anthropic&apos;s cloud, including when used in Claude Desktop. See the <a href="https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp">official Claude connector guide</a>.</p>

    <h3 id="mcp--gemini">Gemini · web and mobile</h3>
    <ol className="list-decimal space-y-2 pl-6">
      <li>On a computer, open Gemini&apos;s <strong>Settings → Connected Apps</strong>. Some accounts show this inside <strong>Personal Intelligence</strong>.</li>
      <li>Under <strong>Custom apps</strong>, add the server URL above, choose <strong>Next</strong> and follow the connection prompts.</li>
      <li>Once connected, type <strong>@</strong> and select the custom app in a chat. The connection can also be used on mobile.</li>
    </ol>
    <p>Google currently limits this feature to English, personal accounts in the US, users aged 18 or over, and accounts with Keep Activity enabled. TCGPlaytest provides no OAuth credentials; if your connection flow requires them or Custom apps is unavailable, use <a href="#mcp--gemini-cli">Gemini CLI</a>. See <a href="https://support.google.com/gemini/answer/17209137?hl=en">Google&apos;s custom app instructions and eligibility</a>.</p>

    <h3 id="mcp--codex">OpenAI Codex</h3>
    <p>With Codex CLI installed, run:</p>
    <CodeExample label="Codex CLI">{`codex mcp add tcgplaytest --url ${endpoint}
codex mcp list`}</CodeExample>
    <p>Start a new Codex session and use <code>/mcp</code> to check tools. Alternatively, merge this into your user <code>~/.codex/config.toml</code>, preserving other settings, then restart your session:</p>
    <CodeExample label="Codex config.toml">{`[mcp_servers.tcgplaytest]
url = "${endpoint}"`}</CodeExample>
    <p>No bearer token or MCP login is needed. In the IDE extension you can also use <strong>MCP servers → Add server → Streamable HTTP</strong>. See <a href="https://learn.chatgpt.com/docs/extend/mcp">OpenAI&apos;s MCP configuration guide</a>.</p>

    <h3 id="mcp--claude-code">Claude Code</h3>
    <p>With Claude Code installed, add the server to your user configuration:</p>
    <CodeExample label="Claude Code CLI">{`claude mcp add --transport http --scope user tcgplaytest ${endpoint}
claude mcp list`}</CodeExample>
    <p>Open a new session and run <code>/mcp</code> to check the connection. No token or OAuth login is required. See the <a href="https://code.claude.com/docs/en/mcp">Claude Code MCP guide</a>.</p>

    <h3 id="mcp--gemini-cli">Gemini CLI</h3>
    <p>With Gemini CLI installed and signed in to your chosen model provider, run:</p>
    <CodeExample label="Gemini CLI">{`gemini mcp add --transport http --scope user tcgplaytest ${endpoint}
gemini mcp list`}</CodeExample>
    <p>Alternatively, merge this entry into <code>~/.gemini/settings.json</code>, preserving other servers. Gemini CLI uses <code>httpUrl</code> for Streamable HTTP:</p>
    <CodeExample label="Gemini settings.json">{JSON.stringify({ mcpServers: { tcgplaytest: { httpUrl: endpoint } } }, null, 2)}</CodeExample>
    <p>Start a new session, check <code>/mcp list</code>, then request a quote. See the <a href="https://geminicli.com/docs/tools/mcp-server/">Gemini CLI MCP guide</a>.</p>

    <h3 id="mcp--cursor">Cursor</h3>
    <p>Add this entry to <code>.cursor/mcp.json</code> in your project, or <code>~/.cursor/mcp.json</code> for all projects. Merge it with existing servers:</p>
    <CodeExample label="Cursor mcp.json">{JSON.stringify({ mcpServers: { tcgplaytest: { url: endpoint } } }, null, 2)}</CodeExample>
    <p>Restart Cursor, check that TCGPlaytest is enabled under <strong>Customize → MCPs</strong>, and ask Agent for an estimate. Review tool approval prompts as they appear. See <a href="https://cursor.com/help/customization/mcp">Cursor&apos;s MCP setup guide</a>.</p>

    <h3 id="mcp--openai-api">OpenAI Responses API · for developers</h3>
    <p>Add this object to the <code>tools</code> array of a Responses API request using an MCP-capable model. Your application uses its own OpenAI API credential; the TCGPlaytest connection needs no authorization value.</p>
    <CodeExample label="OpenAI Responses API · MCP tool">{JSON.stringify({
      type: 'mcp',
      server_label: 'tcgplaytest',
      server_url: endpoint,
      require_approval: 'always',
    }, null, 2)}</CodeExample>
    <p>Your application must handle <code>mcp_approval_request</code> items and submit an <code>mcp_approval_response</code> after the user decides. An approval request is not a completed tool call. Start with the estimate prompt below. See <a href="https://developers.openai.com/api/docs/guides/tools-connectors-mcp">OpenAI&apos;s remote MCP and approval examples</a>.</p>

    <h2 id="mcp--first-order">Try it: estimate, preview and check out</h2>
    <p>First confirm the connection without uploading or creating an order:</p>
    <blockquote>Use TCGPlaytest to show the available card printing options and estimate 2 standard cards shipped to the US. Do not prepare an order yet.</blockquote>
    <p>You should see calls to <code>get_card_printing_options</code> and <code>quote_card_order</code>. Once those work, provide your artwork and ask:</p>
    <blockquote>Print 70 copies of this card with this back, shipping to the US. Show me the estimate and a preview before checkout.</blockquote>
    <ol className="list-decimal space-y-2 pl-6">
      <li>Supply the finished front artwork, optional back artwork and quantity. Use PNG or JPEG files. An assistant that can upload files may request temporary upload links; otherwise provide public HTTPS image URLs.</li>
      <li>Review the printing and shipping estimate. Tax and any applicable discounts are confirmed at checkout.</li>
      <li>The assistant prepares your order and waits for artwork validation. When it is ready, it gives you a private <code>preview_url</code>.</li>
      <li>Open that link to check each front, back and quantity. Six designs appear per page. Tap a side to enlarge it. Any low-resolution warnings remain visible.</li>
      <li>Choose <strong>Continue to checkout</strong>. Enter your delivery details, confirm your image rights and review the final total before paying. Printing starts only after successful payment.</li>
    </ol>
    <p>The preview works in your browser without login, even if your assistant cannot display images inside the chat. It uses your validated artwork and preserves the full-quality printing files. Trim previews hide the prepared 2 mm bleed; final cutting and printed colors can vary slightly. Older files without prepared bleed are shown as full artwork.</p>
    <p>To change an image or quantity, ask your assistant to prepare an updated order. Previewing does not charge you. The assistant cannot pay for an order or collect card payment details through these tools.</p>
    <p><strong>Using a chat attachment?</strong> Attaching an image does not automatically give the MCP server its bytes. Your client needs a file-upload capability to PUT them to the temporary upload URL. If it cannot do that, provide direct public HTTPS PNG/JPEG URLs instead. A local file path, a sharing webpage or a made-up image URL will not work.</p>

    <h2 id="mcp--pricing">MCP sheet pricing</h2>
    <p>MCP orders have a <strong>$34.95 card minimum</strong>. Cards are priced in sheets of 18, rounding up, with a 10% markup on the base rates: $0.35 through 144 billable cards, $0.30 through 500 and $0.26 through 1,000. The last sheet is capped at 1,000 billable cards. Only your requested quantity is printed.</p>
    <p>Prices never decrease when you add cards: totals hold at the preceding sheet price when a rate drops. US shipping is <strong>$6.95</strong>, so <strong>1–90 cards cost $41.90 before tax</strong>. Other countries use their existing quantity-based shipping rates.</p>
    <div className="overflow-x-auto"><table><caption>MCP examples before discounts and tax</caption><thead><tr><th>Cards</th><th>Sheets</th><th>Card price</th><th>With US shipping</th></tr></thead><tbody>
      {[[1, 1, '34.95', '41.90'], [90, 5, '34.95', '41.90'], [108, 6, '41.58', '48.53'], [144, 8, '55.44', '62.39'], [162, 9, '55.44', '62.39'], [250, 14, '83.16', '90.11'], [504, 28, '160.38', '167.33'], [1000, 56, '286.00', '292.95']].map(([cards, sheets, price, total]) => <tr key={cards}><td>{cards}</td><td>{sheets}</td><td>${price}</td><td>${total}</td></tr>)}
    </tbody></table></div>
    <p><strong>Ordering just one card?</strong> You can add 17 more to fill the first sheet, and the minimum covers up to 90 cards total. Your assistant should tell you: “You can still order 89 more cards for no extra printing charge (90 cards total).” It must ask before increasing your quantity. International shipping and tax may change; compare the updated quote.</p>
    <p>Quotes return <code>savings_message</code>, <code>extra_cards_at_same_printing_price</code> and the destination-aware <code>extra_cards_at_same_total_before_tax</code>. Average card price is informational. Preview and checkout show the same pricing. To change quantities, prepare a new order and review its quote.</p>
    <p>Discounts cannot reduce the card subtotal below the greater of $34.95 or $0.26 per billable card. Extra-card allowances are before discounts. MCP requires customer payment and cannot spend PRINTS or partner credit. Website, partner API, widget, prepaid and Connect pricing keep their separate rules.</p>

    <h2>Available tools</h2>
    <ul className="space-y-3">
      <li><code>get_card_printing_options</code> — supported stock, finish, destinations and artwork limits.</li>
      <li><code>quote_card_order</code> — printing and shipping estimate for a quantity and two-letter country code.</li>
      <li><code>create_card_artwork_upload</code> — temporary upload URL for a PNG/JPEG. PUT the actual file bytes with the returned headers, then use the returned image reference.</li>
      <li><code>prepare_card_order</code> — artwork URLs and quantities, plus a fresh random UUID in <code>request_id</code>. Reuse that ID with identical inputs on retries.</li>
      <li><code>get_card_order_preparation</code> — poll with the returned private <code>preparation_token</code>, at least five seconds apart. Once <code>status</code> is <code>open</code>, share <code>preview_url</code> with the customer; checkout and private confirmation links are also returned.</li>
    </ul>
    <CodeExample label="prepare_card_order · example tool arguments">{JSON.stringify({
      request_id: '4c48ff46-29b0-49a3-a2e0-0bb6ad93f419',
      items: [{ image_url: 'https://your-artwork.example/front.png', back_image_url: 'https://your-artwork.example/back.png', quantity: 70 }],
    }, null, 2)}</CodeExample>
    <p>Replace the example URLs with your actual artwork and generate your own UUID for each new order attempt. These are MCP tool arguments, not a REST request to the partner API. Omitting <code>back_image_url</code> uses the standard TCGPlaytest back.</p>

    <h2 id="mcp--confirmation">After payment: confirmation for you and your assistant</h2>
    <p>MCP checkout opens its own TCGPlaytest confirmation page after verified payment and order recording. It does not send you back to the operator&apos;s registered store website.</p>
    <ol className="list-decimal space-y-2 pl-6">
      <li>Keep the <code>receipt_url</code> and <code>receipt_json_url</code> returned with your preparation. They are also available from <code>get_card_order_preparation</code> after checkout while the link is unexpired.</li>
      <li>Open <code>receipt_url</code> to see your order reference, card count and order status. Share this private link with your assistant to read without signing in.</li>
      <li>An agent can GET <code>receipt_json_url</code>, or request <code>receipt_url</code> with <code>Accept: application/json</code>. No API key or login is required.</li>
    </ol>
    <p><code>state: pending</code> means confirmation has not been recorded yet. If you just paid, wait a few seconds and refresh; do not pay again. <code>state: confirmed</code> means the server recorded payment. A cancelled order is labelled <code>cancelled</code>; this page does not report refunds. Test deployments explicitly show <code>environment: test</code>.</p>
    <p>The summary excludes your email, shipping address and payment credentials. Anyone with this private link can read that summary until the original cart <code>expires_at</code>, normally seven days after preparation. Keep it out of public chats. The page runs no analytics or scripts and is not cached or indexed.</p>

    <h2>Limits and private links</h2>
    <ul className="list-disc space-y-2 pl-6">
      <li>Maximum 1,000 total cards per order; standard stock and finish, with a finished size of 63 × 88 mm.</li>
      <li>Single-frame PNG or JPEG, up to 20 MiB and 40 million pixels per file. Files must be valid artwork; a webpage URL cannot be printed.</li>
      <li>Preview, checkout, confirmation, upload and preparation links/tokens are private. Anyone you share a preview link with can view that cart&apos;s artwork.</li>
      <li>Preview image URLs last up to 15 minutes. Use <strong>Reload previews</strong> while the cart is open and unexpired. The returned <code>expires_at</code> tells you when the cart expires.</li>
      <li>Rate limits apply. Honor <code>Retry-After</code> or <code>retry_after_seconds</code>. After a temporary failure, retry the same request ID and artwork instead of creating duplicate preparations.</li>
    </ul>
    <h2>Public MCP and partner integrations</h2>
    <p>All public MCP clients use TCGPlaytest&apos;s ordering service. The customer pays printing, shipping and applicable tax at checkout. Public MCP orders do not use a partner&apos;s prepaid printing balance or Connect earnings. For your own storefront branding, partner order reporting or payout integration, use the <a href="/docs/before-you-start">partner REST API</a> or <a href="/docs/widget">checkout widget</a>.</p>
    <p>No TCGPlaytest server secret belongs in an MCP client. The operator&apos;s partner API key and signing secret stay on TCGPlaytest&apos;s servers. A browser-based client on another website may need its exact origin allowed by TCGPlaytest; desktop/server clients sending no Origin header do not need that setting.</p>
    <h2>If you cannot connect</h2>
    <p>Check the full server URL and the remote HTTP transport. A 503 response means the service is disabled, not configured or temporarily unavailable; it does not mean you need to create a customer key. Contact <a href="https://www.tcgplaytest.com/support">support</a> if it continues. For invalid artwork, replace the affected file and prepare an updated order.</p>
    <p>If no tools appear, enable the connection and start a new conversation. Use the platform-specific configuration above: Gemini CLI&apos;s <code>httpUrl</code>, Cursor&apos;s <code>url</code> and Codex&apos;s TOML format are different. For a 403, contact support with the platform name; an operator may need to allow its exact browser origin. Keep API keys and private preparation links out of support screenshots.</p>
  </section>
}
