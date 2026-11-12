jest.mock('../modules/anor-telephony/src', () => ({ snapshotNative: { readTheme: jest.fn(), writeTheme: jest.fn(), readAccent: jest.fn(), writeAccent: jest.fn() } }));
const { snapshotNative } = require('../modules/anor-telephony/src');
const { readTheme, writeTheme, readAccent, writeAccent } = require('../src/storage/themeStorage.ts');
beforeEach(() => {
  jest.clearAllMocks();
  snapshotNative.readTheme.mockResolvedValue('system'); snapshotNative.readAccent.mockResolvedValue('blue');
  snapshotNative.writeTheme.mockResolvedValue(undefined); snapshotNative.writeAccent.mockResolvedValue(undefined);
});
test('theme and accent restore independently; default blue remains available', async () => {
  expect(await readTheme()).toBe('system'); expect(await readAccent()).toBe('blue');
  snapshotNative.readAccent.mockResolvedValue('orange');
  expect(await readAccent()).toBe('orange');
  await writeTheme('dark'); await writeAccent('green');
  expect(snapshotNative.writeTheme).toHaveBeenCalledWith('dark');
  expect(snapshotNative.writeAccent).toHaveBeenCalledWith('green');
});
test.each([null, 'unknown', 42, { color: 'red' }])('invalid stored accent %p is reported, not accepted as a theme', async (value) => {
  snapshotNative.readAccent.mockResolvedValue(value);
  await expect(readAccent()).rejects.toThrow('INVALID_ACCENT');
});
test('rapid color choices serialize writes so the final choice cannot be overwritten', async () => {
  let finish;
  snapshotNative.writeAccent.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
  const green = writeAccent('green'); const red = writeAccent('red');
  for (let i = 0; i < 6; i++) await Promise.resolve();
  expect(snapshotNative.writeAccent).toHaveBeenCalledTimes(1);
  finish(); await Promise.all([green, red]);
  expect(snapshotNative.writeAccent.mock.calls.map(([value]) => value)).toEqual(['green', 'red']);
});
test('write errors are exposed and a later selection can still be saved', async () => {
  snapshotNative.writeAccent.mockRejectedValueOnce(new Error('disk full'));
  await expect(writeAccent('purple')).rejects.toThrow('disk full');
  await expect(writeAccent('teal')).resolves.toBeUndefined();
  expect(snapshotNative.writeAccent).toHaveBeenLastCalledWith('teal');
});
