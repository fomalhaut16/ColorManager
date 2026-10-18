import core from '../../data/color-registry.core.json';
import extensions from '../../data/color-registry.extensions.json';
import literals from '../../data/color-literals.json';

export interface RegistryEntry {
  needsTransparency: boolean;
  /** "theme" = set by light_vs, "null" = no value, otherwise the resolved/default hex or a color id. */
  vsLightDefault: string;
  source: string;
}

/** Committed registry (plan 7.2): core colors plus colors contributed by installed extensions. */
export const REGISTRY: Readonly<Record<string, RegistryEntry>> = {
  ...(extensions.colors as Record<string, RegistryEntry>),
  ...(core.colors as Record<string, RegistryEntry>),
};

export const REGISTRY_VERSION = core.vscodeVersion;

/** Ids that kept their Visual Studio Light value regardless of hue when only explicit rules were written. */
export const LITERAL_IDS: ReadonlySet<string> = new Set(literals.ids);
