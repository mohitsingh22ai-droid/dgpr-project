import { EmailPayload } from "./types";

interface RenderedTemplate {
  subject: string;
  text: string;
  html: string;
}

function baseLayout(title: string, bodyContent: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    body { margin: 0; padding: 0; background-color: #0b0d11; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #f3f4f6; }
    .container { max-width: 600px; margin: 0 auto; background-color: #11141a; border: 1px solid #232733; border-radius: 8px; overflow: hidden; }
    .header { background-color: #171b23; padding: 24px 32px; border-bottom: 2px solid #ff5a1f; }
    .logo { font-size: 20px; font-weight: 800; letter-spacing: -0.5px; color: #ffffff; text-decoration: none; }
    .logo span { color: #ff5a1f; }
    .badge { display: inline-block; font-size: 11px; font-family: monospace; background: rgba(255, 90, 31, 0.15); color: #ff5a1f; border: 1px solid rgba(255, 90, 31, 0.3); padding: 2px 8px; border-radius: 4px; text-transform: uppercase; margin-left: 8px; }
    .content { padding: 32px; font-size: 14px; line-height: 1.6; color: #d1d5db; }
    .content h1 { font-size: 20px; color: #ffffff; margin-top: 0; margin-bottom: 16px; }
    .highlight-box { background-color: #171b23; border: 1px solid #232733; border-radius: 6px; padding: 16px; margin: 20px 0; font-family: monospace; font-size: 13px; color: #e5e7eb; }
    .table-details { width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 13px; }
    .table-details th { text-align: left; padding: 8px; border-bottom: 1px solid #232733; color: #9ca3af; }
    .table-details td { padding: 8px; border-bottom: 1px solid #1c202a; }
    .btn { display: inline-block; background-color: #ff5a1f; color: #ffffff !important; text-decoration: none; font-weight: 600; font-size: 14px; padding: 12px 24px; border-radius: 6px; margin-top: 16px; }
    .footer { background-color: #0b0d11; padding: 24px 32px; font-size: 12px; color: #6b7280; border-top: 1px solid #1f2430; }
  </style>
</head>
<body>
  <div style="padding: 24px 12px;">
    <div class="container">
      <div class="header">
        <span class="logo">W2P<span>.</span></span>
        <span class="badge">Web-to-Print Platform</span>
      </div>
      <div class="content">
        ${bodyContent}
      </div>
      <div class="footer">
        <p style="margin: 0;">W2P Industrial Manufacturing · All print jobs manufactured to ISO 12647-2 standards.</p>
        <p style="margin: 4px 0 0 0;">This email was sent to your registered account address regarding your order specifications.</p>
      </div>
    </div>
  </div>
</body>
</html>`;
}

export function renderEmail(payload: EmailPayload): RenderedTemplate {
  const customerName = payload.recipientName || "Valued Customer";
  const orderRef = payload.orderNumber || payload.orderId;

  switch (payload.event) {
    case "order_confirmed": {
      const subject = `Order Confirmed: ${orderRef}`;
      const itemsList = (payload.items || [])
        .map((it) => `• ${it.name} (Qty: ${it.quantity}) - ${it.amount}`)
        .join("\n");
      const addr = payload.shippingAddress
        ? `${payload.shippingAddress.name}, ${payload.shippingAddress.line1}, ${payload.shippingAddress.city} ${payload.shippingAddress.postal_code}, ${payload.shippingAddress.country}`
        : "Standard Shipping Address on File";

      const text = `Hello ${customerName},

Thank you for your order with W2P. We have received your payment and confirmed your manufacturing job.

Order Reference: ${orderRef}
Total: ${payload.totalFormatted || "Paid in Full"}

Items:
${itemsList || "• Custom Print Job"}

Shipping Destination:
${addr}

Next Step:
Our pre-press engine is generating your high-fidelity digital proof. You will receive an alert once proof v1 is ready for your inspection in the customer dashboard.

Track your order:
${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/dashboard`;

      const htmlRows = (payload.items || [])
        .map(
          (it) => `<tr>
          <td><strong>${it.name}</strong>${it.material ? `<br><small style="color:#9ca3af">${it.material}</small>` : ""}</td>
          <td>${it.quantity}</td>
          <td style="text-align: right;">${it.amount}</td>
        </tr>`
        )
        .join("");

      const html = baseLayout(
        subject,
        `<h1>Order Confirmed</h1>
        <p>Hello <strong>${customerName}</strong>,</p>
        <p>Thank you for choosing W2P. Your order <strong>${orderRef}</strong> has been successfully placed and paid.</p>
        
        <div class="highlight-box">
          <div><strong>Order Number:</strong> ${orderRef}</div>
          <div><strong>Status:</strong> Payment Confirmed & Queued</div>
          <div><strong>Total Paid:</strong> ${payload.totalFormatted || "Paid"}</div>
        </div>

        ${
          htmlRows
            ? `<table class="table-details">
            <thead>
              <tr><th>Item</th><th>Qty</th><th style="text-align: right;">Amount</th></tr>
            </thead>
            <tbody>
              ${htmlRows}
            </tbody>
          </table>`
            : ""
        }

        <h3>Shipping Destination</h3>
        <p style="color: #9ca3af; margin-bottom: 24px;">
          ${payload.shippingAddress?.name || customerName}<br>
          ${payload.shippingAddress?.line1 || ""}<br>
          ${payload.shippingAddress?.city || ""}, ${payload.shippingAddress?.postal_code || ""}<br>
          ${payload.shippingAddress?.country || "United Kingdom"}
        </p>

        <a href="${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/dashboard" class="btn">View Order Dashboard</a>`
      );

      return { subject, text, html };
    }

    case "proof_ready": {
      const v = payload.version || 1;
      const subject = `Digital Proof Ready for Review: ${orderRef} (Revision v${v})`;
      const text = `Hello ${customerName},

Your digital proof revision v${v} for order ${orderRef} is now ready for your review.

PRD Approval Gate:
In accordance with our manufacturing standards, production files remain locked until you inspect and formally approve this proof.

Please review your proof here:
${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/dashboard

Thank you,
W2P Pre-Press Team`;

      const html = baseLayout(
        subject,
        `<h1>Digital Proof Ready (Revision v${v})</h1>
        <p>Hello <strong>${customerName}</strong>,</p>
        <p>Our pre-press department has prepared your digital proof <strong>v${v}</strong> for order <strong>${orderRef}</strong>.</p>
        
        <div class="highlight-box">
          <div style="color: #ff5a1f; font-weight: bold;">⚠️ APPROVAL GATE ACTIVE</div>
          <div style="margin-top: 6px;">Manufacturing is paused until you inspect and approve this artwork proof.</div>
        </div>

        <p>Please inspect the cut boundaries, safety margins, and visual placement on your customer dashboard. You can either approve the proof with one click or request specific design changes.</p>

        <a href="${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/dashboard" class="btn">Inspect & Approve Proof</a>`
      );

      return { subject, text, html };
    }

    case "change_requested": {
      const v = payload.version || 1;
      const nextV = v + 1;
      const subject = `Revisions Logged for Order ${orderRef} (Proof v${v})`;
      const text = `Hello ${customerName},

We have received your requested changes for order ${orderRef} (Proof v${v}).

Your Feedback:
"${payload.feedback || "Revisions requested"}"

Our pre-press team is updating your artwork files. Proof v${nextV} will be generated shortly and uploaded to your dashboard. Manufacturing files remain locked until the new revision is approved.

Review status:
${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/dashboard`;

      const html = baseLayout(
        subject,
        `<h1>Artwork Revisions Logged</h1>
        <p>Hello <strong>${customerName}</strong>,</p>
        <p>We received your revision request on proof <strong>v${v}</strong> for order <strong>${orderRef}</strong>.</p>

        <div class="highlight-box">
          <strong>Your Change Request Comments:</strong>
          <p style="margin: 8px 0 0 0; color: #f3f4f6;">"${payload.feedback || "Revisions requested"}"</p>
        </div>

        <p>Our pre-press technicians are adjusting the layout. An updated digital proof (<strong>v${nextV}</strong>) will be uploaded to your dashboard shortly.</p>

        <a href="${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/dashboard" class="btn">View Revision Status</a>`
      );

      return { subject, text, html };
    }

    case "proof_approved": {
      const v = payload.version || 1;
      const subject = `Proof Approved: Order ${orderRef} (v${v})`;
      const text = `Hello ${customerName},

Thank you! You have formally approved proof v${v} for order ${orderRef}.

Approval Details:
• Approved Version: v${v}
• Proof Hash (SHA-256): ${payload.proofHash || "N/A"}
• Timestamp: ${new Date().toISOString()}

Production Gate:
300 DPI high-resolution production assets have been UNLOCKED and dispatched to our physical manufacturing pipeline.

Track progress:
${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/dashboard`;

      const html = baseLayout(
        subject,
        `<h1>Proof Formally Approved</h1>
        <p>Hello <strong>${customerName}</strong>,</p>
        <p>You have approved proof <strong>v${v}</strong> for order <strong>${orderRef}</strong>.</p>

        <div class="highlight-box">
          <div style="color: #10b981; font-weight: bold;">✔ PRODUCTION ASSETS UNLOCKED</div>
          <div style="margin-top: 6px;"><strong>Approved Version:</strong> v${v}</div>
          ${payload.proofHash ? `<div style="word-break: break-all; margin-top: 4px;"><strong>SHA-256 Hash:</strong> ${payload.proofHash}</div>` : ""}
        </div>

        <p>Your job has entered the manufacturing queue and is advancing to physical plate output and printing.</p>

        <a href="${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/dashboard" class="btn">Track Production Progress</a>`
      );

      return { subject, text, html };
    }

    case "pipeline_status_changed": {
      const stage = payload.stage || "IN PRODUCTION";
      const subject = `Order Update: ${orderRef} is now in ${stage}`;
      const text = `Hello ${customerName},

Your order ${orderRef} has advanced to the next manufacturing stage: ${stage}.

Our production line is actively processing your custom print run.

Track your order in real time:
${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/dashboard`;

      const html = baseLayout(
        subject,
        `<h1>Manufacturing Pipeline Update</h1>
        <p>Hello <strong>${customerName}</strong>,</p>
        <p>Your order <strong>${orderRef}</strong> has progressed to a new stage in our production facility.</p>

        <div class="highlight-box">
          <div><strong>Current Pipeline Stage:</strong> <span style="color: #ff5a1f; font-weight: bold;">${stage}</span></div>
          <div style="margin-top: 6px;">Facility: W2P Main Press Hall</div>
        </div>

        <p>You can monitor each step of the manufacturing lifecycle directly from your customer portal.</p>

        <a href="${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/dashboard" class="btn">View Live Pipeline</a>`
      );

      return { subject, text, html };
    }

    case "order_completed": {
      const subject = `Order Completed & Dispatched: ${orderRef}`;
      const addr = payload.shippingAddress
        ? `${payload.shippingAddress.name}, ${payload.shippingAddress.line1}, ${payload.shippingAddress.city} ${payload.shippingAddress.postal_code}`
        : "Your shipping destination";

      const text = `Hello ${customerName},

Great news! Your order ${orderRef} has completed physical production and quality inspection, and has been dispatched for delivery.

Shipping to:
${addr}

You can download your official GST tax invoice receipt and reorder with 1 click directly from your dashboard:
${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/dashboard

Thank you for choosing W2P!`;

      const html = baseLayout(
        subject,
        `<h1>Order Completed & Dispatched</h1>
        <p>Hello <strong>${customerName}</strong>,</p>
        <p>Your custom print order <strong>${orderRef}</strong> has cleared final quality control and is on its way to you.</p>

        <div class="highlight-box">
          <div style="color: #10b981; font-weight: bold;">✔ PRODUCTION COMPLETE</div>
          <div style="margin-top: 6px;"><strong>Delivery Destination:</strong> ${addr}</div>
        </div>

        <p>Your official GST tax invoice and high-resolution print files are preserved in your account archive for seamless 1-click reordering.</p>

        <a href="${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/dashboard" class="btn">Download GST Invoice & View Order</a>`
      );

      return { subject, text, html };
    }

    default: {
      const subject = `Notification: Order ${orderRef}`;
      return {
        subject,
        text: `Hello ${customerName},\n\nUpdate regarding order ${orderRef}.\n\nVisit: ${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/dashboard`,
        html: baseLayout(subject, `<p>Hello ${customerName}, update on order ${orderRef}.</p>`),
      };
    }
  }
}
