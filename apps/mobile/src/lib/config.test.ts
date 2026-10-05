import { resolveApiUrl } from './config';

describe('resolveApiUrl', () => {
  it('prefers EXPO_PUBLIC_API_URL', () => {
    expect(
      resolveApiUrl({
        envUrl: 'https://api.example.com',
        platform: 'android',
        isDev: true,
        devServerHostUri: '192.168.1.10:8081',
      }),
    ).toBe('https://api.example.com');
  });

  it('uses the computer running the dev server on a device', () => {
    expect(
      resolveApiUrl({ platform: 'android', isDev: true, devServerHostUri: '192.168.1.10:8081' }),
    ).toBe('http://192.168.1.10:4000');
  });

  it('does not guess the API host from a tunnel', () => {
    expect(
      resolveApiUrl({
        platform: 'ios',
        isDev: true,
        devServerHostUri: 'abc-anonymous-8081.exp.direct',
      }),
    ).toBe('http://localhost:4000');
  });

  it('uses the page host on the web', () => {
    expect(resolveApiUrl({ platform: 'web', isDev: true, webHostname: 'localhost' })).toBe(
      'http://localhost:4000',
    );
  });

  it('falls back to localhost', () => {
    expect(resolveApiUrl({ platform: 'ios', isDev: true })).toBe('http://localhost:4000');
  });

  it('requires an explicit URL in release builds', () => {
    expect(() => resolveApiUrl({ platform: 'android', isDev: false })).toThrow(
      'EXPO_PUBLIC_API_URL is not set',
    );
    expect(
      resolveApiUrl({ platform: 'android', isDev: false, envUrl: 'https://api.example.com' }),
    ).toBe('https://api.example.com');
  });
});
