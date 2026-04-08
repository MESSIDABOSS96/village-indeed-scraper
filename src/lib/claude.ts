import Anthropic from "@anthropic-ai/sdk";
import { buildStage1Prompt, buildStage2Prompt } from "./prompts";
import type { Stage1Result, Stage2Result } from "./types";

const anthropic = new Anthropic({ maxRetries: 4 });

const RETRY_DELAYS = [15_000, 30_000, 60_000];

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err: unknown) {
      const isRateLimit =
        err instanceof Error && "status" in err && (err as { status: number }).status === 429;
      if (!isRateLimit || attempt >= RETRY_DELAYS.length) throw err;
      await new Promise((r) => setTimeout(r, RETRY_DELAYS[attempt]));
    }
  }
}

function extractJson(text: string): string {
  // Try to find JSON in code blocks first
  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) return codeBlockMatch[1].trim();

  // Otherwise find the first { ... } block
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start !== -1 && end !== -1) return text.slice(start, end + 1);

  return text;
}

export async function runStage1(resumeText: string): Promise<Stage1Result> {
  const response = await withRetry(() =>
    anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2048,
      messages: [
        { role: "user", content: buildStage1Prompt(resumeText) },
      ],
    })
  );

  const content = response.content[0];
  if (content.type !== "text") {
    throw new Error("Unexpected response type from Claude Stage 1");
  }

  const parsed = JSON.parse(extractJson(content.text));
  return {
    firstName: parsed.firstName ?? null,
    lastName: parsed.lastName ?? null,
    email: parsed.email ?? null,
    phoneNumber: parsed.phoneNumber ?? null,
    city: parsed.city ?? null,
    stateRegion: parsed.stateRegion ?? null,
    postalCode: parsed.postalCode ?? null,
    linkedinUrl: parsed.linkedinUrl ?? null,
    licenseType: parsed.licenseType ?? null,
    licenseNumber: parsed.licenseNumber ?? null,
    licenseState: parsed.licenseState ?? null,
    specialties: parsed.specialties ?? [],
    agesServed: parsed.agesServed ?? null,
    careSettings: parsed.careSettings ?? [],
    languages: parsed.languages ?? [],
    workExperience: parsed.workExperience ?? null,
    yearsOutOfSchool: parsed.yearsOutOfSchool ?? null,
  };
}

export async function runStage2(stage1: Stage1Result): Promise<Stage2Result> {
  const response = await withRetry(() =>
    anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2048,
      messages: [
        { role: "user", content: buildStage2Prompt(JSON.stringify(stage1, null, 2)) },
      ],
    })
  );

  const content = response.content[0];
  if (content.type !== "text") {
    throw new Error("Unexpected response type from Claude Stage 2");
  }

  const parsed = JSON.parse(extractJson(content.text));
  return {
    firstName: parsed.firstName ?? "",
    lastName: parsed.lastName ?? "",
    villageRole: parsed.villageRole ?? "",
    email: parsed.email ?? "",
    phoneNumber: parsed.phoneNumber ?? "",
    city: parsed.city ?? "",
    stateRegion: parsed.stateRegion ?? "",
    postalCode: parsed.postalCode ?? "",
    linkedinUrl: parsed.linkedinUrl ?? "",
    segment: parsed.segment ?? "",
    specialties: parsed.specialties ?? "",
    agesServed: parsed.agesServed ?? "",
    careSetting: parsed.careSetting ?? "",
    languagesSpoken: parsed.languagesSpoken ?? "",
    licenseType: parsed.licenseType ?? "",
    licenseNumber: parsed.licenseNumber ?? "",
    licenseState: parsed.licenseState ?? "",
    confidence: parsed.confidence ?? {},
  };
}
