/**
 * Legal documents — Terms of Service & Privacy Policy.
 *
 * This is a plain-data module so the viewer component stays dumb.
 * Placeholder tokens in [square brackets] must be adapted by the operator:
 *   [OPERATOR NAME], [CONTACT EMAIL], [GOVERNING LAW / JURISDICTION], [DATE]
 */

export const TERMS_VERSION = "1.0";
export const TERMS_UPDATED = "2025-01-01";
export const SERVICE_NAME = "Midnight Garage";

export type LegalSection = {
  heading: string;
  paragraphs?: string[];
  bullets?: string[];
};

export type LegalDoc = {
  id: "terms" | "privacy";
  title: string;
  updated: string;
  intro: string;
  sections: LegalSection[];
};

export const TERMS_OF_SERVICE: LegalDoc = {
  id: "terms",
  title: "Terms of Service",
  updated: TERMS_UPDATED,
  intro: `Welcome to ${SERVICE_NAME}. These Terms govern your use of the ${SERVICE_NAME} software and any instance of it operated by [OPERATOR NAME] (the "Service"). By creating an account or using the Service you agree to these Terms. If you do not agree, do not use the Service.`,
  sections: [
    {
      heading: "1. What the Service is",
      paragraphs: [
        `${SERVICE_NAME} is a self-hostable, local-first workbench that lets you ask questions about your own documents (retrieval-augmented generation, "RAG"). Documents you upload are processed on the machine that runs the Service. The Service acts as a tool and intermediary: it does not create or curate content beyond the model output described below.`,
      ],
    },
    {
      heading: "2. Accounts and security",
      paragraphs: [
        "You are responsible for your account and for keeping your password confidential. Accounts require a username and password; passwords are stored only as salted hashes.",
        "You must notify the operator of any unauthorized use of your account. The operator may suspend or terminate accounts that violate these Terms.",
      ],
    },
    {
      heading: "3. Your content and documents",
      paragraphs: [
        "You keep all rights to the documents you upload and the text you enter (\"Your Content\"). You grant the Service only the technical permission needed to store, process and search Your Content in order to answer your questions — nothing more.",
        "You represent and warrant that you have the right to upload and process Your Content, and that doing so does not violate any law or third-party right (including copyright, confidentiality or data-protection rights). Do not upload content you do not have permission to use.",
      ],
    },
    {
      heading: "4. Third-party services and API keys",
      bullets: [
        "If you configure an external model endpoint (for example an OpenAI-compatible API provider), your prompts, conversation history and retrieved document excerpts are sent to that provider and processed under that provider's own terms and privacy policy. The operator does not control those providers.",
        "If you use a local model runtime (for example Ollama) or the built-in offline embeddings, processing stays on the machine running the Service.",
        "API keys you enter are stored encrypted and used solely to authenticate requests to the endpoint you configured. You are responsible for the keys you add and for complying with the terms of the provider that issued them.",
      ],
    },
    {
      heading: "5. Acceptable use",
      paragraphs: ["You agree not to use the Service:"],
      bullets: [
        "for any unlawful purpose or in violation of any applicable law or regulation;",
        "to upload, process or distribute content that is illegal, infringing, or that you are not authorized to use;",
        "to attempt to gain unauthorized access to the Service, other accounts, or related systems;",
        "to interfere with, overload or disrupt the integrity or performance of the Service;",
        "to generate or distribute content that harms minors, or content intended to deceive (e.g. disinformation, fraudulent documents).",
      ],
    },
    {
      heading: "6. AI-generated output",
      paragraphs: [
        "Answers produced by language models may be inaccurate, incomplete or out of date, even when grounded in your documents. You are responsible for verifying anything important before relying on it. AI output does not constitute professional advice (legal, medical, financial or otherwise).",
      ],
    },
    {
      heading: "7. Privacy",
      paragraphs: [
        "Data handling is described in the Privacy Policy, which is part of these Terms. In short: the Service stores your account data, settings and conversations on the machine that runs it, encrypts sensitive material at rest, and sends data to third parties only when and where you configure it to.",
      ],
    },
    {
      heading: "8. Intellectual property",
      paragraphs: [
        "The Service software is provided under its applicable license. These Terms do not transfer any intellectual-property rights in the software to you, and nothing in these Terms claims ownership of Your Content.",
      ],
    },
    {
      heading: "9. No warranty",
      paragraphs: [
        `THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE", WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NON-INFRINGEMENT. THE OPERATOR DOES NOT WARRANT THAT THE SERVICE WILL BE UNINTERRUPTED, ERROR-FREE OR SECURE.`,
      ],
    },
    {
      heading: "10. Limitation of liability",
      paragraphs: [
        `TO THE FULLEST EXTENT PERMITTED BY LAW, THE OPERATOR SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL OR PUNITIVE DAMAGES, OR FOR ANY LOSS OF DATA, PROFITS OR GOODWILL, ARISING FROM OR RELATED TO YOUR USE OF THE SERVICE. THE OPERATOR'S TOTAL LIABILITY FOR ALL CLAIMS SHALL NOT EXCEED THE GREATER OF (A) THE AMOUNTS YOU PAID FOR THE SERVICE IN THE 12 MONTHS BEFORE THE CLAIM, OR (B) EUR 50. NOTHING IN THESE TERMS LIMITS LIABILITY FOR DEATH, PERSONAL INJURY, FRAUD OR ANY LIABILITY THAT CANNOT BE LIMITED BY LAW.`,
      ],
    },
    {
      heading: "11. Indemnification",
      paragraphs: [
        "You agree to indemnify and hold harmless the operator from claims, damages and expenses (including reasonable legal fees) arising from Your Content or your use of the Service in violation of these Terms or applicable law.",
      ],
    },
    {
      heading: "12. Termination",
      paragraphs: [
        "You may stop using the Service and delete your account at any time (Settings → Account → Delete account, which erases your data). The operator may suspend or terminate access for material breach of these Terms. Sections that by their nature should survive termination (e.g. limitation of liability, indemnification) do so.",
      ],
    },
    {
      heading: "13. Changes to the Service or these Terms",
      paragraphs: [
        "The operator may modify the Service or these Terms. Material changes to the Terms will be communicated before they take effect (for example by re-requesting acceptance on the affected accounts). Continued use after changes take effect constitutes acceptance.",
      ],
    },
    {
      heading: "14. Governing law",
      paragraphs: [
        "These Terms are governed by the laws of [GOVERNING LAW / JURISDICTION], without regard to conflict-of-law rules. Mandatory consumer-protection rights in your country of residence remain unaffected.",
      ],
    },
    {
      heading: "15. Contact",
      paragraphs: ["Questions about these Terms: [CONTACT EMAIL]."],
    },
  ],
};

export const PRIVACY_POLICY: LegalDoc = {
  id: "privacy",
  title: "Privacy Policy",
  updated: TERMS_UPDATED,
  intro: `This policy explains what data ${SERVICE_NAME} stores and how it is handled. The Service is self-hosted: the "data controller" for your instance is the operator who runs it — [OPERATOR NAME]. This policy applies to data stored by the Service itself.`,
  sections: [
    {
      heading: "1. Data we store",
      bullets: [
        "Account: username, salted password hash (scrypt — we never store your actual password), Terms-of-Service acceptance timestamp and version.",
        "Settings: model endpoints and models you configure; API keys, stored encrypted (AES-256-GCM).",
        "Chats: your messages and the assistant's answers, plus optional source references — stored encrypted at rest.",
        "Documents: file name, size, page and chunk counts; the extracted text is embedded and stored as encrypted vector-index files on the server's disk.",
        "Technical: a session cookie so you stay logged in. Nothing else.",
      ],
    },
    {
      heading: "2. Data we do NOT collect",
      bullets: [
        "No telemetry, analytics or crash reporting.",
        "No advertising or third-party trackers.",
        "No profiling and no data selling — ever.",
      ],
    },
    {
      heading: "3. Cookies",
      paragraphs: [
        "We set one strictly-necessary cookie (\"rag_session\"): HTTP-only, SameSite=Lax, used only to authenticate your session. It contains a signed token, no personal data beyond your user id. The background-image choice is kept in your browser's sessionStorage on your own device.",
      ],
    },
    {
      heading: "4. Third-party processing",
      paragraphs: [
        "By default, all processing stays on the machine running the Service. Data leaves that machine only if you configure an external model endpoint: in that case your prompt, relevant conversation history and retrieved document excerpts are transmitted to the provider whose endpoint you entered (for example an OpenAI-compatible API host), under that provider's terms and privacy policy. Check the provider's policy before sending confidential documents. If you use only local runtimes (Ollama, built-in offline embeddings) or the built-in provider with default endpoints, no document or chat content is sent anywhere by the Service itself.",
      ],
    },
    {
      heading: "5. Security",
      paragraphs: [
        "Passwords are hashed with scrypt (salted, timing-safe comparison). API keys, chat content and extracted document text are encrypted at rest with AES-256-GCM. Session cookies are HTTP-only. No system is perfectly secure: the operator should keep the host machine safe and keep the app private (do not expose it to the public internet without additional hardening such as HTTPS and a reverse proxy).",
      ],
    },
    {
      heading: "6. Retention and deletion",
      bullets: [
        "Data is kept until you delete it.",
        "Deleting a chat or document removes it permanently.",
        "Deleting your account (Settings → Account → Delete account) erases your account, settings, conversations, messages, document records and your vector-index files. This is immediate and irreversible.",
      ],
    },
    {
      heading: "7. Your rights",
      paragraphs: [
        "Depending on where you live (e.g. in the EU/EEA under the GDPR), you have rights of access, rectification, erasure, restriction of processing, data portability and objection. Because the Service is self-hosted and keeps no secrets from its operator, the practical route is: use the in-app deletion tools for erasure, and contact the operator for anything else.",
      ],
    },
    {
      heading: "8. Children",
      paragraphs: ["The Service is not directed at children under 16, and we do not knowingly collect their data."],
    },
    {
      heading: "9. Changes to this policy",
      paragraphs: [
        "Material changes will be announced before they take effect (e.g. via re-requested Terms acceptance). The \"last updated\" date above reflects the current version.",
      ],
    },
    {
      heading: "10. Contact",
      paragraphs: ["Privacy questions or requests: [CONTACT EMAIL]."],
    },
  ],
};

export const LEGAL_DOCS: Record<"terms" | "privacy", LegalDoc> = {
  terms: TERMS_OF_SERVICE,
  privacy: PRIVACY_POLICY,
};
