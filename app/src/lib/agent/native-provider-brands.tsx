// Purpose: Name and mark each native provider once for every app surface.
import {
  ANTIGRAVITY,
  CLAUDE_CODE,
  CODEX,
  DEEPINFRA,
  GROK,
  OPENCODE_GO,
  type NativeProviderID,
} from "@openchart/models/model-tiers";
import type { ComponentType } from "react";
import {
  ClaudeLogo,
  OpenAILogo,
  type LogoProps,
} from "@openchart/app/components/ui/model-selector/logos";
import { Layers } from "lucide-react";
import { AntigravityLogo } from "@openchart/app/components/ui/brand/antigravity-logo";
import { AgentMark } from "@openchart/app/components/ui/brand/agent-marks";

/** A provider's display identity; `agent` names it in prose such as "Analyze with Claude". */
export interface NativeProviderBrand {
  readonly name: string;
  readonly agent: string;
  readonly Logo: ComponentType<LogoProps>;
}

/** Grok wears xAI's mark in the surrounding text color. @example <GrokLogo className="size-4" /> */
function GrokLogo(props: LogoProps) {
  return <AgentMark agent="xai" {...props} />;
}

/** DeepInfra serves a multi-model catalog; a neutral stacked-layers mark keeps the host distinct from its model authors. @example <DeepInfraLogo className="size-4" /> */
function DeepInfraLogo(props: LogoProps) {
  return <Layers aria-hidden="true" {...props} />;
}

/** OpenCode Go wears OpenCode's mark. @example <OpenCodeLogo className="size-4" /> */
function OpenCodeLogo(props: LogoProps) {
  return <AgentMark agent="openCode" {...props} />;
}

/**
 * Every supported provider's name and mark, keyed by provider ID so a new
 * provider fails to compile until it is named here.
 * @example
 * const { name, Logo } = NATIVE_PROVIDER_BRANDS[providerID];
 */
export const NATIVE_PROVIDER_BRANDS: Readonly<
  Record<NativeProviderID, NativeProviderBrand>
> = {
  [CODEX]: { name: "Codex", agent: "Codex", Logo: OpenAILogo },
  [CLAUDE_CODE]: { name: "Claude Code", agent: "Claude", Logo: ClaudeLogo },
  [ANTIGRAVITY]: {
    name: "Antigravity",
    agent: "Antigravity",
    Logo: AntigravityLogo,
  },
  [GROK]: { name: "Grok", agent: "Grok", Logo: GrokLogo },
  [DEEPINFRA]: {
    name: "DeepInfra",
    agent: "DeepInfra",
    Logo: DeepInfraLogo,
  },
  [OPENCODE_GO]: {
    name: "OpenCode Go",
    agent: "OpenCode Go",
    Logo: OpenCodeLogo,
  },
};

/**
 * Brands a provider ID received as data; IDs outside the supported set have none.
 * @example const Logo = nativeProviderBrand(provider.id)?.Logo;
 */
export function nativeProviderBrand(
  providerID: string,
): NativeProviderBrand | undefined {
  return Object.hasOwn(NATIVE_PROVIDER_BRANDS, providerID)
    ? NATIVE_PROVIDER_BRANDS[providerID as NativeProviderID]
    : undefined;
}
