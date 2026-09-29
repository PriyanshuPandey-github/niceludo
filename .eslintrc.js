module.exports = {
  root: true,
  extends: '@react-native',
  rules: {
    // Board pieces are coloured per player and positioned per board size, so
    // most style objects here are computed at render time on purpose.
    'react-native/no-inline-styles': 'off',
  },
  overrides: [
    {
      // The asset generator is a plain Node script: it needs the Node globals
      // and it is bit twiddling by nature (PNG CRC and zlib framing).
      files: ['scripts/**/*.js'],
      env: { node: true },
      rules: { 'no-bitwise': 'off' },
    },
  ],
};
