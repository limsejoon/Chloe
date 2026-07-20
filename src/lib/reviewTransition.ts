export interface WordProgressState {
  round: number;
  status: 'pending' | 'correct';
  missedThisRound: boolean;
  wrongRounds: number[];
  retired: boolean;
}

export function initialProgress(): WordProgressState {
  return { round: 1, status: 'pending', missedThisRound: false, wrongRounds: [], retired: false };
}

export function applyAnswer(state: WordProgressState, isCorrect: boolean): WordProgressState {
  if (state.retired) {
    throw new Error('Cannot answer a retired word.');
  }

  if (!isCorrect) {
    return { ...state, status: 'pending', missedThisRound: true };
  }

  if (!state.missedThisRound) {
    return { ...state, status: 'correct', retired: true };
  }

  return {
    round: state.round + 1,
    status: 'pending',
    missedThisRound: false,
    wrongRounds: [...state.wrongRounds, state.round],
    retired: false,
  };
}

export function isWeakWord(state: WordProgressState): boolean {
  return state.wrongRounds.length >= 3;
}
