/*
 * Shared configuration for AI Autochat.
 * Loaded by the service worker, the content script, and the popup.
 *
 * Site adapters are intentionally data-driven: when a provider changes its
 * DOM, add or adjust selectors here rather than editing the automation loop.
 */
(function () {
  "use strict";

  const SITES = [
    {
      id: "chatgpt",
      name: "ChatGPT",
      hosts: ["chatgpt.com", "chat.openai.com"],
      composer: [
        "#prompt-textarea",
        'div.ProseMirror[contenteditable="true"]',
        'form[data-type="unified-composer"] [contenteditable="true"]',
        "textarea#prompt-textarea"
      ],
      send: [
        'button[data-testid="send-button"]',
        'button[aria-label="Send prompt"]',
        'button[aria-label="Send message"]',
        'button[aria-label="Send"]',
        'form button[type="submit"]'
      ],
      generating: [
        'button[data-testid="stop-button"]',
        'button[aria-label="Stop streaming"]',
        'button[aria-label="Stop generating"]',
        'button[aria-label="Stop response"]'
      ]
    },
    {
      id: "gemini",
      name: "Gemini",
      hosts: ["gemini.google.com"],
      composer: [
        'rich-textarea .ql-editor[contenteditable="true"]',
        'div.ql-editor[contenteditable="true"]',
        'div[contenteditable="true"][role="textbox"]',
        'textarea[aria-label*="prompt" i]'
      ],
      send: [
        'button[aria-label="Send message"]',
        'button.send-button',
        'button[aria-label*="Send" i]',
        'button[type="submit"]'
      ],
      generating: [
        'button[aria-label="Stop response"]',
        'button[aria-label="Stop generating"]',
        'button[aria-label*="Stop" i]'
      ]
    },
    {
      id: "claude",
      name: "Claude",
      hosts: ["claude.ai"],
      composer: [
        'div.ProseMirror[contenteditable="true"]',
        'fieldset div[contenteditable="true"]',
        'div[contenteditable="true"][data-placeholder]',
        "textarea"
      ],
      send: [
        'button[aria-label="Send message"]',
        'button[aria-label="Send Message"]',
        'button[aria-label="Send"]',
        'button[type="submit"]'
      ],
      generating: [
        'button[aria-label="Stop response"]',
        'button[aria-label*="Stop" i]'
      ]
    },
    {
      id: "copilot",
      name: "Copilot",
      hosts: ["copilot.microsoft.com"],
      composer: [
        "textarea#userInput",
        'textarea[data-testid="composer-input"]',
        'div[contenteditable="true"][data-testid="composer-input"]',
        'textarea[placeholder*="Message" i]'
      ],
      send: [
        'button[data-testid="send-button"]',
        'button#send-button',
        'button[aria-label="Submit message"]',
        'button[aria-label*="Send" i]',
        'button[type="submit"]'
      ],
      generating: [
        'button[data-testid="stop-button"]',
        'button[aria-label*="Stop" i]'
      ]
    },
    {
      id: "perplexity",
      name: "Perplexity",
      hosts: ["perplexity.ai"],
      composer: [
        'textarea[placeholder*="Ask" i]',
        'div[contenteditable="true"][role="textbox"]',
        "textarea"
      ],
      send: [
        'button[aria-label="Submit"]',
        'button[data-testid="submit-button"]',
        'button[aria-label*="Send" i]',
        'button[type="submit"]'
      ],
      generating: [
        'button[aria-label="Stop"]',
        'button[data-testid="stop-button"]',
        'button[aria-label*="Stop" i]'
      ]
    },
    {
      id: "grok",
      name: "Grok",
      hosts: ["grok.com"],
      composer: [
        'textarea[aria-label*="Grok" i]',
        'div[contenteditable="true"][role="textbox"]',
        "textarea"
      ],
      send: [
        'button[type="submit"]',
        'button[aria-label*="Send" i]',
        'button[aria-label*="Submit" i]'
      ],
      generating: ['button[aria-label*="Stop" i]', 'button[data-testid="stop-button"]']
    },
    {
      id: "deepseek",
      name: "DeepSeek",
      hosts: ["chat.deepseek.com"],
      composer: [
        "textarea#chat-input",
        'textarea[placeholder*="Message" i]',
        'div[contenteditable="true"][role="textbox"]'
      ],
      send: [
        'button[aria-label*="Send" i]',
        'div[role="button"][aria-label*="Send" i]',
        'button[type="submit"]'
      ],
      generating: [
        'div[role="button"][aria-label*="Stop" i]',
        'button[aria-label*="Stop" i]'
      ]
    },
    {
      id: "mistral",
      name: "Le Chat",
      hosts: ["chat.mistral.ai"],
      composer: [
        'div.ProseMirror[contenteditable="true"]',
        'div[contenteditable="true"][role="textbox"]',
        "textarea"
      ],
      send: [
        'button[aria-label*="Send" i]',
        'button[type="submit"]'
      ],
      generating: ['button[aria-label*="Stop" i]']
    },
    {
      id: "poe",
      name: "Poe",
      hosts: ["poe.com"],
      composer: [
        'div[contenteditable="true"][role="textbox"]',
        'textarea[placeholder*="Talk" i]',
        "textarea"
      ],
      send: [
        'button[aria-label*="Send" i]',
        'button[type="submit"]'
      ],
      generating: ['button[aria-label*="Stop" i]']
    },
    {
      id: "qwen",
      name: "Qwen Chat",
      hosts: ["chat.qwen.ai"],
      composer: [
        'textarea[placeholder*="help" i]',
        'div[contenteditable="true"][role="textbox"]',
        "textarea"
      ],
      send: [
        'button[aria-label*="Send" i]',
        'button[type="submit"]'
      ],
      generating: ['button[aria-label*="Stop" i]']
    },
    {
      id: "huggingchat",
      name: "HuggingChat",
      hosts: ["huggingface.co"],
      pathPrefix: "/chat",
      composer: [
        'textarea[placeholder*="Ask" i]',
        'div[contenteditable="true"][role="textbox"]',
        "textarea"
      ],
      send: [
        'button[aria-label*="Send" i]',
        'button[type="submit"]'
      ],
      generating: ['button[aria-label*="Stop" i]']
    }
  ];

  const DEFAULTS = Object.freeze({
    enabled: false,
    minSeconds: 20,
    maxSeconds: 45,
    waitForResponse: true,
    responseTimeoutSeconds: 300,
    showHud: true,
    customMessages: ""
  });

  const PROMPTS = Object.freeze([
    "Hi! How's your day going?",
    "Hello! What's something interesting you learned recently?",
    "Hey! Tell me a fun fact in one sentence.",
    "What's a small thing that made you smile today?",
    "Give me a one-line joke.",
    "What's your favorite season and why?",
    "Recommend a movie for a cozy night in.",
    "What's a good name for a pet goldfish?",
    "Tell me a short riddle.",
    "If you could visit any country tomorrow, where would you go?",
    "What's a simple hobby worth trying?",
    "Describe your ideal weekend in one sentence.",
    "What's a comforting food for a rainy day?",
    "Give me a random word and a tiny poem about it.",
    "What's one easy way to be kind to a stranger?",
    "Tell me something surprising about the ocean.",
    "What's a fun fact about cats?",
    "What's a fun fact about space?",
    "Give me a quick productivity tip.",
    "What's a good conversation starter?",
    "Recommend a song for a sunny morning.",
    "What's the best way to learn something new?",
    "Tell me a short story in three sentences.",
    "What's a simple recipe I can make in ten minutes?",
    "Give me a creative idea for a rainy afternoon.",
    "What's a cool fact about trees?",
    "How do you like your coffee or tea?",
    "What's a word that sounds beautiful?",
    "Tell me a pun.",
    "What's a good book to read on a long trip?",
    "Describe a perfect picnic.",
    "What's one thing everyone should try once?",
    "Give me a random act of kindness idea.",
    "What's your favorite type of weather?",
    "Tell me a fact about the human brain.",
    "What's a simple way to brighten someone's day?",
    "Recommend a board game for friends.",
    "What's a fun question to ask a friend?",
    "Give me a two-line poem about the moon.",
    "What's a good habit to start this week?",
    "Tell me something interesting about bees.",
    "What's the most relaxing sound you can think of?",
    "Suggest a name for a small coffee shop.",
    "What's a fun fact about honey?",
    "If you had a free afternoon, what would you do?",
    "Give me a short encouragement.",
    "What's a good way to spend five minutes offline?",
    "Tell me a mini adventure story.",
    "What's a nice thing to say to a friend?",
    "Recommend a simple exercise for a break.",
    "What's a fun fact about lightning?",
    "Describe a dream treehouse.",
    "What's a good icebreaker for a new team?",
    "Give me a random compliment I can give someone.",
    "What's a tasty sandwich idea?",
    "Tell me a fact about the sun.",
    "What's a good way to remember things?",
    "Suggest a theme for a movie night.",
    "What's a fun fact about penguins?",
    "Give me a tiny challenge for today.",
    "What's a calming bedtime routine?",
    "Recommend a podcast topic.",
    "What's a beautiful place in the world?",
    "Tell me a short myth from any culture.",
    "What's a useful phrase in another language?",
    "Give me a fun fact about the human heart.",
    "What's a good way to start a journal?",
    "Suggest a weekend craft project.",
    "What's a simple way to save money?",
    "Tell me something fascinating about music.",
    "What's a good question to reflect on today?"
  ]);

  /**
   * Find a site adapter by hostname and optional path.
   * Subdomains (for example www.perplexity.ai) are matched automatically.
   */
  function getSite(hostname, pathname) {
    const host = String(hostname || "").toLowerCase().replace(/^www\./, "");
    const path = String(pathname || "/");

    for (const site of SITES) {
      if (!site.hosts.some((candidate) => host === candidate || host.endsWith("." + candidate))) {
        continue;
      }
      if (site.pathPrefix && !path.startsWith(site.pathPrefix)) {
        continue;
      }
      return site;
    }
    return null;
  }

  function getSiteById(id) {
    return SITES.find((site) => site.id === id) || null;
  }

  globalThis.AUTOCHAT = Object.freeze({
    version: "1.0.0",
    sites: SITES,
    defaults: DEFAULTS,
    prompts: PROMPTS,
    getSite,
    getSiteById
  });
})();
