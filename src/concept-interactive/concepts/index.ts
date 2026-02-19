import type { InteractiveConceptDefinition, InteractiveConceptId } from "../types";
import { bassConcept } from "./bass";
import { densityConcept } from "./density";
import { dynamicConcept } from "./dynamic";
import { ildConcept } from "./ild";
import { resolutionConcept } from "./resolution";
import { separationConcept } from "./separation";
import { transientConcept } from "./transient";
import { trebleConcept } from "./treble";

export const INTERACTIVE_CONCEPTS: Record<InteractiveConceptId, InteractiveConceptDefinition> = {
  ild: ildConcept,
  bass_extension: bassConcept,
  treble_extension: trebleConcept,
  resolution: resolutionConcept,
  separation: separationConcept,
  transient: transientConcept,
  dynamic: dynamicConcept,
  density: densityConcept
};

export function getConceptDefinition(id: InteractiveConceptId): InteractiveConceptDefinition {
  return INTERACTIVE_CONCEPTS[id];
}
