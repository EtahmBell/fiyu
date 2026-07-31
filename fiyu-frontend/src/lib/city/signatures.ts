import type { ComponentType, SVGProps } from "react";

import {
  TokyoDiscoveriesEmptyIllustration,
  TokyoFishIllustration,
  TokyoKikuMark,
  TokyoListsEmptyIllustration,
  TokyoMochiIllustration,
  TokyoNoodleIllustration,
  TokyoOdenIllustration,
  TokyoOnigiriIllustration,
  TokyoPicksWatermark,
  TokyoSavedEmptyIllustration,
  TokyoVisitsEmptyIllustration,
} from "@/components/city-signature/TokyoArtwork";
import type { CityId } from "@/lib/city/editions";

export type CityArtwork = ComponentType<SVGProps<SVGSVGElement>>;
export type CityEmptyStateKind = "saved" | "discoveries" | "visits" | "lists";

export interface CitySignature {
  cityId: CityId;
  headerMark?: CityArtwork;
  loadingIllustrations?: CityArtwork[];
  picksWatermark?: CityArtwork;
  emptyStateIllustrations?: Partial<Record<CityEmptyStateKind, CityArtwork>>;
  accentToken?: string;
}

export const TOKYO_CITY_SIGNATURE: CitySignature = {
  cityId: "tokyo",
  headerMark: TokyoKikuMark,
  // Order is the sequence the loading state plays, not an alphabetical list.
  loadingIllustrations: [
    TokyoOdenIllustration,
    TokyoNoodleIllustration,
    TokyoFishIllustration,
    TokyoOnigiriIllustration,
    TokyoMochiIllustration,
  ],
  picksWatermark: TokyoPicksWatermark,
  emptyStateIllustrations: {
    saved: TokyoSavedEmptyIllustration,
    discoveries: TokyoDiscoveriesEmptyIllustration,
    visits: TokyoVisitsEmptyIllustration,
    lists: TokyoListsEmptyIllustration,
  },
  accentToken: "var(--color-rose-dust)",
};

const CITY_SIGNATURES: Partial<Record<CityId, CitySignature>> = {
  tokyo: TOKYO_CITY_SIGNATURE,
};

export function citySignatureFor(cityId: CityId): CitySignature | null {
  return CITY_SIGNATURES[cityId] ?? null;
}
