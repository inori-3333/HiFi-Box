import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import type { InteractiveConceptSuiteController } from "./useInteractiveConceptSuite";
import { rotateOrder, useInteractiveConceptSuite } from "./useInteractiveConceptSuite";

declare global {
  // React 18 test env flag
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

function Harness(props: { onSuite: (suite: InteractiveConceptSuiteController) => void }) {
  const suite = useInteractiveConceptSuite();
  props.onSuite(suite);
  return null;
}

describe("useInteractiveConceptSuite", () => {
  let container: HTMLDivElement;
  let root: Root;
  let suiteRef: InteractiveConceptSuiteController | null;

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    suiteRef = null;
    act(() => {
      root.render(
        <Harness
          onSuite={(suite) => {
            suiteRef = suite;
          }}
        />
      );
    });
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("starts single concept and advances trial index after submit", () => {
    const suite = suiteRef as InteractiveConceptSuiteController;
    act(() => {
      suite.startSingleConcept("ild");
    });

    const started = suiteRef as InteractiveConceptSuiteController;
    expect(started.currentConceptId).toBe("ild");
    expect(started.currentTrials.length).toBeGreaterThan(1);

    act(() => {
      started.submitAnswer({ choice: "left", ild_estimate_db: 1.2 });
    });

    const advanced = suiteRef as InteractiveConceptSuiteController;
    expect(advanced.currentTrialIndex).toBe(1);
  });

  it("completes single concept after skipping all trials", () => {
    act(() => {
      (suiteRef as InteractiveConceptSuiteController).startSingleConcept("density");
    });

    let guard = 0;
    while ((suiteRef as InteractiveConceptSuiteController).currentTrial && guard < 20) {
      act(() => {
        (suiteRef as InteractiveConceptSuiteController).skipTrial();
      });
      guard += 1;
      if ((suiteRef as InteractiveConceptSuiteController).phase === "completed") {
        break;
      }
    }

    const done = suiteRef as InteractiveConceptSuiteController;
    expect(done.phase).toBe("completed");
    expect(done.conceptResults.length).toBe(1);
  });

  it("suite mode enters concept-complete and can move to next concept", () => {
    act(() => {
      (suiteRef as InteractiveConceptSuiteController).startSuite("ild");
    });

    let guard = 0;
    while ((suiteRef as InteractiveConceptSuiteController).phase !== "concept-complete" && guard < 20) {
      act(() => {
        (suiteRef as InteractiveConceptSuiteController).skipTrial();
      });
      guard += 1;
    }

    const mid = suiteRef as InteractiveConceptSuiteController;
    expect(mid.phase).toBe("concept-complete");

    act(() => {
      mid.moveToNextConcept();
    });

    const next = suiteRef as InteractiveConceptSuiteController;
    expect(next.currentConceptId).not.toBe("ild");
    expect(["practice", "testing"]).toContain(next.phase);
  });

  it("rotateOrder puts selected concept at first position", () => {
    const order = rotateOrder("transient");
    expect(order[0]).toBe("transient");
    expect(new Set(order).size).toBe(8);
  });
});
