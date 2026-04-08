export const PARAM_RANGES: Record<string, { min: number; max: number }> = {
  'osc.waveform':        { min: 0,    max: 4    },
  'osc.osc2Waveform':    { min: 0,    max: 4    },
  'osc.osc2Level':       { min: 0,    max: 1    },
  'osc.osc2Semi':        { min: -24,  max: 24   },
  'osc.osc2Detune':      { min: -100, max: 100  },
  'osc.subLevel':        { min: 0,    max: 1    },
  'osc.noiseLevel':      { min: 0,    max: 1    },
  'osc.pulseWidth':      { min: 0,    max: 1    },
  'osc.unisonCount':     { min: 1,    max: 8    },
  'osc.unisonSpread':    { min: 0,    max: 100  },
  'osc.glideTime':       { min: 0,    max: 2000 },
  'voiceFilter.cutoff':     { min: 20,   max: 20000 },
  'voiceFilter.resonance':  { min: 0,    max: 1     },
  'voiceFilter.envAmount':  { min: 0,    max: 1     },
  'filter.cutoff':       { min: 20,   max: 20000 },
  'filter.resonance':    { min: 0,    max: 1     },
  'reverb.roomSize':     { min: 0,    max: 1     },
  'reverb.wetLevel':     { min: 0,    max: 1     },
  'delay.time':          { min: 50,   max: 2000  },
  'delay.feedback':      { min: 0,    max: 0.95  },
  'delay.wetLevel':      { min: 0,    max: 1     },
  'chorus.rate':         { min: 0.1,  max: 8     },
  'chorus.depth':        { min: 0,    max: 1     },
  'chorus.mix':          { min: 0,    max: 1     },
  'distortion.drive':    { min: 0,    max: 10    },
  'distortion.mix':      { min: 0,    max: 1     },
  'distortion.tone':     { min: 0,    max: 1     },
  'comp.threshold':      { min: -60,  max: 0     },
  'comp.ratio':          { min: 1,    max: 16    },
  'comp.attack':         { min: 1,    max: 100   },
  'comp.release':        { min: 10,   max: 1000  },
  'lfo.rate':            { min: 0.1,  max: 10    },
  'lfo.depth':           { min: 0,    max: 1     },
  'lfo.destination':     { min: 0,    max: 5     },
  'lfo.waveform':        { min: 0,    max: 4     },
};

export function normalizeParam(paramId: string, rawValue: number): number {
  const range = PARAM_RANGES[paramId];
  if (!range) return rawValue;
  const { min, max } = range;
  if (max === min) return 0;
  return Math.max(0, Math.min(1, (rawValue - min) / (max - min)));
}

export function denormalizeParam(paramId: string, normValue: number): number {
  const range = PARAM_RANGES[paramId];
  if (!range) return normValue;
  return range.min + normValue * (range.max - range.min);
}
