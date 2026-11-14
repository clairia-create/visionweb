// VisionWeb AI Studio — authenticated website design assistant.
// OPENAI_API_KEY is a Supabase Edge Function secret. Never put it in browser code.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

function getPublishableKey(): string | null {
  const raw = Deno.env.get("SUPABASE_PUBLISHABLE_KEYS");
  if (raw) {
    try {
      const keys = JSON.parse(raw);
      if (typeof keys.default === "string") return keys.default;
      const first = Object.values(keys).find((value) => typeof value === "string");
      if (typeof first === "string") return first;
    } catch {
      // Fall back to the legacy anon key below.
    }
  }
  return Deno.env.get("SUPABASE_ANON_KEY") ?? null;
}

function getOutputText(payload: Record<string, unknown>): string {
  if (typeof payload.output_text === "string") return payload.output_text;
  const output = Array.isArray(payload.output) ? payload.output : [];
  const parts: string[] = [];
  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const content = (item as Record<string, unknown>).content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (part && typeof part === "object") {
        const value = part as Record<string, unknown>;
        if (value.type === "output_text" && typeof value.text === "string") {
          parts.push(value.text);
        }
      }
    }
  }
  return parts.join("\n");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed." });

  const authorization = req.headers.get("Authorization");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const publishableKey = getPublishableKey();
  const openAiKey = Deno.env.get("OPENAI_API_KEY");

  if (!authorization?.startsWith("Bearer ") || !supabaseUrl || !publishableKey) {
    return json(401, { error: "Please sign in to VisionWeb before using AI Studio." });
  }
  if (!openAiKey) {
    return json(503, {
      error: "VisionWeb AI is not connected yet. Add OPENAI_API_KEY to Supabase Edge Function Secrets, then deploy this function.",
    });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "The request could not be read." });
  }

  const siteId = String(body.siteId ?? "");
  const prompt = String(body.prompt ?? "").trim();
  const businessName = String(body.businessName ?? "").trim();
  const businessType = String(body.businessType ?? "other").trim();
  const designDirection = String(body.designDirection ?? "").trim().slice(0, 1200);
  const currentHtml = String(body.currentHtml ?? "");
  const history = Array.isArray(body.history) ? body.history : [];
  const images = Array.isArray(body.images) ? body.images : [];

  if (!/^[0-9a-f-]{36}$/i.test(siteId)) return json(400, { error: "Choose or create a website project first." });
  if (!prompt || prompt.length > 12000) return json(400, { error: "Write a request of up to 12,000 characters." });
  if (!businessName || businessName.length > 120) return json(400, { error: "Enter a business or website name (up to 120 characters)." });
  if (currentHtml.length > 180000) return json(413, { error: "This draft is too large to edit in one request." });
  if (images.length > 4) return json(400, { error: "Attach no more than four reference photos at a time." });

  const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { apikey: publishableKey, Authorization: authorization },
  });
  if (!userResponse.ok) return json(401, { error: "Your session has expired. Sign in again." });
  const user = await userResponse.json();
  if (!user?.id) return json(401, { error: "Your VisionWeb session could not be verified." });

  const restHeaders = {
    apikey: publishableKey,
    Authorization: authorization,
    "Content-Type": "application/json",
  };

  const adminResponse = await fetch(
    `${supabaseUrl}/rest/v1/visionweb_admins?user_id=eq.${encodeURIComponent(user.id)}&select=user_id`,
    { headers: restHeaders },
  );
  if (!adminResponse.ok) return json(403, { error: "Administrator access could not be checked." });
  const admins = await adminResponse.json();
  if (!Array.isArray(admins) || admins.length === 0) {
    return json(403, { error: "Only an approved VisionWeb administrator can use AI Studio." });
  }

  const siteResponse = await fetch(
    `${supabaseUrl}/rest/v1/visionweb_ai_sites?id=eq.${encodeURIComponent(siteId)}&admin_user_id=eq.${encodeURIComponent(user.id)}&select=id,business_name`,
    { headers: restHeaders },
  );
  if (!siteResponse.ok) return json(400, { error: "The website draft was not found. Save it and try again." });
  const sites = await siteResponse.json();
  if (!Array.isArray(sites) || sites.length === 0) {
    return json(404, { error: "This website draft does not belong to your administrator account." });
  }

  const safeImages: Array<{ url: string; token: string; name: string }> = [];
  for (let index = 0; index < images.length; index++) {
    const item = images[index];
    if (!item || typeof item !== "object") continue;
    const image = item as Record<string, unknown>;
    const url = String(image.url ?? "");
    const token = String(image.token ?? "");
    const name = String(image.name ?? `Reference image ${index + 1}`);
    const allowedPrefix = `${supabaseUrl}/storage/v1/object/sign/visionweb-ai-assets/${user.id}/${siteId}/`;
    if (!url.startsWith(allowedPrefix) || !token.match(/^\{\{VISIONWEB_IMAGE_[1-4]\}\}$/)) {
      return json(400, { error: "A reference image link is invalid. Reload the draft and try again." });
    }
    safeImages.push({ url, token, name: name.slice(0, 120) });
  }

  const conversation = history
    .filter((item) => item && typeof item === "object")
    .slice(-10)
    .map((item) => {
      const message = item as Record<string, unknown>;
      const role = message.role === "assistant" ? "assistant" : "user";
      return {
        role,
        content: String(message.content ?? "").slice(0, 12000),
      };
    });

  const imageGuide = safeImages.length
    ? "\nReference photos supplied for this project (keep the originals unchanged):\n" +
      safeImages.map((image) => `- ${image.name}: use the exact placeholder ${image.token} as the img src if you place this original photo.`).join("\n")
    : "";

  const currentContext = currentHtml
    ? "\nCURRENT WEBSITE HTML (edit this existing site; preserve working parts unless asked to change them):\n" + currentHtml
    : "\nThere is no existing website yet. Create the first complete version.";

  const userText = [
    `Business / project: ${businessName}`,
    `Business type: ${businessType}`,
    `Design direction: ${designDirection || "Choose a distinctive design that fits the business and the user's instructions."}`,
    `My instruction: ${prompt}`,
    imageGuide,
    currentContext,
    "\nCreate a complete, polished, responsive website as one self-contained HTML document. Use natural, human-sounding copy. Make thoughtful visual decisions when details are missing. Do not invent business facts, addresses, phone numbers, prices, opening hours, policies or testimonials; use clear editable placeholders or ask for missing facts. Keep reference photos unchanged and use their exact VisionWeb image placeholders. Return the complete HTML document, not a tutorial or partial snippet.",
  ].join("\n");

  const input = [
    ...conversation,
    {
      role: "user",
      content: [
        { type: "input_text", text: userText },
        ...safeImages.map((image) => ({
          type: "input_image",
          image_url: image.url,
          detail: "high",
        })),
      ],
    },
  ];

  const model = Deno.env.get("OPENAI_MODEL") || "gpt-6.1-sol";
  const openAiResponse = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openAiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      instructions: [
        "You are VisionWeb AI, a senior web designer and front-end developer.",
        "Understand simple, informal instructions, including imperfect spelling. Never make the user learn technical vocabulary.",
        "Create distinctive, professional, editorial-quality websites with strong typography, spacing, clear hierarchy, responsive layouts and accessible contrast. Avoid generic template appearance.",
        "Return complete working HTML with inline CSS and any required JavaScript. Keep all interactions inside the page. Use semantic HTML and mobile-first responsive CSS.",
        "Never execute external code, request credentials, expose secrets or put API keys in the website. Do not add hidden trackers.",
        "Keep supplied original photos unchanged. Use the exact supplied VisionWeb image placeholder tokens in image src attributes. Do not replace client photos with generated or stock images unless explicitly requested.",
        "Use human, natural wording. Avoid robotic filler and fake reviews. Do not invent real-world business information.",
        "Do not use iframe, object, embed, browser storage, top-level navigation or code that tries to escape the preview sandbox.",
        "Respond with the required JSON structure only.",
      ].join(" "),
      input,
      text: {
        format: {
          type: "json_schema",
          name: "visionweb_website_build",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              assistant_message: { type: "string" },
              design_summary: { type: "string" },
              html_document: { type: "string" },
            },
            required: ["assistant_message", "design_summary", "html_document"],
          },
        },
      },
      max_output_tokens: 12000,
      store: false,
    }),
  });

  if (!openAiResponse.ok) {
    const errorText = await openAiResponse.text();
    console.error("OpenAI Responses API error:", openAiResponse.status, errorText.slice(0, 1200));
    return json(502, {
      error: openAiResponse.status === 401
        ? "The AI key was not accepted. Check the OPENAI_API_KEY secret in Supabase."
        : openAiResponse.status === 429
        ? "The AI service is busy or its usage limit has been reached. Check your API usage and billing."
        : "The AI service could not complete this request. Check the configured model and try again.",
    });
  }

  const responsePayload = await openAiResponse.json();
  const outputText = getOutputText(responsePayload);
  let result: Record<string, unknown>;
  try {
    result = JSON.parse(outputText);
  } catch {
    console.error("VisionWeb AI returned an unreadable structured response.");
    return json(502, { error: "The AI returned an incomplete result. Please try a simpler instruction." });
  }

  const htmlDocument = String(result.html_document ?? "").trim();
  if (htmlDocument.length < 100 || htmlDocument.length > 240000 || !/<html[\s>]/i.test(htmlDocument)) {
    return json(502, { error: "The AI did not return a complete website. Please ask it to try again." });
  }

  return json(200, {
    assistant_message: String(result.assistant_message ?? "I have updated the website preview."),
    design_summary: String(result.design_summary ?? ""),
    html_document: htmlDocument,
    model,
  });
});
