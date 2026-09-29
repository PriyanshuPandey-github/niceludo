// The native haptics module does not exist under Jest.
const HapticFeedback = {
  trigger: jest.fn(),
  triggerPattern: jest.fn(),
  impact: jest.fn(),
  stop: jest.fn(),
  isSupported: jest.fn(() => true),
  setEnabled: jest.fn(),
  isEnabled: jest.fn(() => true),
  playAHAP: jest.fn(() => Promise.resolve()),
  getSystemHapticStatus: jest.fn(() =>
    Promise.resolve({ vibrationEnabled: true, ringerMode: 'normal' }),
  ),
};
module.exports = HapticFeedback;
module.exports.default = HapticFeedback;
