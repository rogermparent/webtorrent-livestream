import { Reducer, useReducer, useState } from "react";

interface MagnetsListState {
  initMagnet?: string;
  magnets: string[];
  newMagnets?: string[];
  oldMagnets?: string[];
}

export const reduceMagnetsList: Reducer<MagnetsListState, string[]> = (
  state,
  incomingMagnets
) => {
  const { magnets } = state;
  const [initMagnet, ...magnetsToAdd] = incomingMagnets;
  const lastMagnet = magnets[magnets.length - 1];
  const lastNewMagnet = magnetsToAdd[magnetsToAdd.length - 1];

  if (lastMagnet === lastNewMagnet) {
    // There are no new updates
    const length = state.newMagnets?.length;
    if (length && length > 0) {
      return {
        initMagnet,
        oldMagnets: magnets,
        magnets,
      };
    } else {
      return state;
    }
  }

  const finalOverlappingIndex = magnetsToAdd.findIndex((ourMagnet) => {
    return ourMagnet === lastMagnet;
  });

  const newMagnets = magnetsToAdd.slice(finalOverlappingIndex + 1);

  if (finalOverlappingIndex === -1 && magnets.length !== 0) {
    console.warn(
      "Given list has no overlap with ours! Segments may be missing.",
      {
        incomingMagnets,
        magnets,
      }
    );
    return {
      initMagnet,
      oldMagnets: magnets,
      newMagnets,
      magnets: magnets.concat(newMagnets),
    };
  } else {
    return {
      initMagnet,
      oldMagnets: magnets,
      newMagnets,
      magnets: magnets.slice(0, finalOverlappingIndex).concat(newMagnets),
    };
  }
};

export const useMagnetList = () =>
  useReducer(reduceMagnetsList, { magnets: [] });
