import { CodeExample } from './code-example'

const endpoint = 'https://tcgplaytest.com/api/mcp'

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
    <CodeExample label="Remote MCP configuration">{JSON.stringify({ mcpServers: { tcgplaytest: { url: endpoint } } }, null, 2)}</CodeExample>
    <p>Use your client&apos;s remote-server settings if its configuration format differs from this example.</p>

    <h2>Prepare, preview and check out</h2>
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

    <h2>Available tools</h2>
    <ul className="space-y-3">
      <li><code>get_card_printing_options</code> — supported stock, finish, destinations and artwork limits.</li>
      <li><code>quote_card_order</code> — printing and shipping estimate for a quantity and two-letter country code.</li>
      <li><code>create_card_artwork_upload</code> — temporary upload URL for a PNG/JPEG. PUT the actual file bytes with the returned headers, then use the returned image reference.</li>
      <li><code>prepare_card_order</code> — artwork URLs and quantities, plus a fresh random UUID in <code>request_id</code>. Reuse that ID with identical inputs on retries.</li>
      <li><code>get_card_order_preparation</code> — poll with the returned private <code>preparation_token</code>, at least five seconds apart. Once <code>status</code> is <code>open</code>, share <code>preview_url</code> with the customer; <code>checkout_url</code> is also returned.</li>
    </ul>
    <CodeExample label="prepare_card_order · example tool arguments">{JSON.stringify({
      request_id: '4c48ff46-29b0-49a3-a2e0-0bb6ad93f419',
      items: [{ image_url: 'https://your-artwork.example/front.png', back_image_url: 'https://your-artwork.example/back.png', quantity: 70 }],
    }, null, 2)}</CodeExample>
    <p>Replace the example URLs with your actual artwork and generate your own UUID for each new order attempt. These are MCP tool arguments, not a REST request to the partner API. Omitting <code>back_image_url</code> uses the standard TCGPlaytest back.</p>

    <h2>Limits and private links</h2>
    <ul className="list-disc space-y-2 pl-6">
      <li>Maximum 1,000 total cards per order; standard stock and finish, with a finished size of 63 × 88 mm.</li>
      <li>Single-frame PNG or JPEG, up to 20 MiB and 40 million pixels per file. Files must be valid artwork; a webpage URL cannot be printed.</li>
      <li>Preview, checkout, upload and preparation links/tokens are private. Anyone you share a preview link with can view that cart&apos;s artwork.</li>
      <li>Preview image URLs last up to 15 minutes. Use <strong>Reload previews</strong> while the cart is open and unexpired. The returned <code>expires_at</code> tells you when the cart expires.</li>
      <li>Rate limits apply. Honor <code>Retry-After</code> or <code>retry_after_seconds</code>. After a temporary failure, retry the same request ID and artwork instead of creating duplicate preparations.</li>
    </ul>
    <h2>Public MCP and partner integrations</h2>
    <p>All public MCP clients use TCGPlaytest&apos;s ordering service. The customer pays printing, shipping and applicable tax at checkout. Public MCP orders do not use a partner&apos;s prepaid printing balance or Connect earnings. For your own storefront branding, partner order reporting or payout integration, use the <a href="/docs/before-you-start">partner REST API</a> or <a href="/docs/widget">checkout widget</a>.</p>
    <p>No TCGPlaytest server secret belongs in an MCP client. The operator&apos;s partner API key and signing secret stay on TCGPlaytest&apos;s servers. A browser-based client on another website may need its exact origin allowed by TCGPlaytest; desktop/server clients sending no Origin header do not need that setting.</p>
    <h2>If you cannot connect</h2>
    <p>Check the full server URL and the remote HTTP transport. A 503 response means the service is disabled, not configured or temporarily unavailable; it does not mean you need to create a customer key. Contact <a href="https://www.tcgplaytest.com/support">support</a> if it continues. For invalid artwork, replace the affected file and prepare an updated order.</p>
  </section>
}
