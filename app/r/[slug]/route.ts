import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import {
  getRequestIp,
  hashClickIp,
  parseRecipientToken,
} from "@/lib/tracking/server";

type RedirectRouteProps = {
  params: Promise<{ slug: string }>;
};

function redirectPage(destinationUrl: string) {
  const escapedUrl = destinationUrl
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
  const jsUrl = JSON.stringify(destinationUrl).replaceAll("<", "\\u003c");

  return new NextResponse(
    `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta http-equiv="refresh" content="0;url=${escapedUrl}" />
    <title>Opening link…</title>
  </head>
  <body>
    <main style="font-family:Arial,sans-serif;max-width:420px;margin:80px auto;padding:24px;text-align:center">
      <p id="status">Opening link…</p>
      <a id="continue" href="${escapedUrl}" rel="noreferrer"
         style="display:none;padding:14px 20px;background:#111;color:#fff;text-decoration:none;border-radius:8px;font-weight:600">
        Continue to destination
      </a>
    </main>
    <script>
      const continueLink = document.getElementById("continue");
      const status = document.getElementById("status");
      setTimeout(() => {
        status.textContent = "If the link did not open automatically, tap below.";
        continueLink.style.display = "inline-block";
      }, 1000);
      window.location.replace(${jsUrl});
    </script>
  </body>
</html>`,
    {
      status: 200,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
        "x-robots-tag": "noindex, nofollow",
      },
    }
  );
}

export async function GET(request: NextRequest, { params }: RedirectRouteProps) {
  const { slug } = await params;
  const trackedLink = await prisma.trackedLink.findUnique({
    where: { slug },
    select: {
      id: true,
      workspaceId: true,
      automationId: true,
      destinationUrl: true,
      automation: {
        select: {
          instagramAccountId: true,
        },
      },
    },
  });

  if (!trackedLink) {
    return NextResponse.redirect(new URL("/", request.url), { status: 302 });
  }

  await prisma.linkClick.create({
    data: {
      workspaceId: trackedLink.workspaceId,
      automationId: trackedLink.automationId,
      instagramAccountId: trackedLink.automation.instagramAccountId,
      trackedLinkId: trackedLink.id,
      ipHash: hashClickIp(getRequestIp(request)),
      recipientHash: parseRecipientToken(
        new URL(request.url).searchParams.get("r")
      ),
      userAgent: request.headers.get("user-agent"),
      referrer: request.headers.get("referer"),
    },
  });

  return redirectPage(trackedLink.destinationUrl);
}
