import { resolveApiUrl } from './config';

describe('resolveApiUrl', () => {
  it('prefers EXPO_PUBLIC_API_URL', () => {
    expect(
      resolveApiUrl({
        envUrl: 'https://api.example.com',
        platform: 'android',
        devServerHostUri: '192.168.1.10:8081',
      }),
    ).toBe('https://api.example.com');
  });

  it('uses the computer running the dev server on a device', () => {
    expect(resolveApiUrl({ platform: 'android', devServerHostUri: '192.168.1.10:8081' })).toBe(
      'http://192.168.1.10:4000',
    );
  });

  it('uses the page host on the web', () => {
    expect(
      resolveApiUrl({ platform: 'web', webHostname: 'localhost', devServerHostUri: undefined }),
    ).toBe('http://localhost:4000');
  });

  it('falls back to localhost', () => {
    expect(resolveApiUrl({ platform: 'ios' })).toBe('http://localhost:4000');
  });
});
