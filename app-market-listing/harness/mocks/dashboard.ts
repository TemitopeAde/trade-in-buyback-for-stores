// Routes the real dashboard to the view named in ?path=.
export const dashboard = {
  observeState: (cb: (params: unknown, env: { locale: string }) => void) => {
    const path = new URLSearchParams(location.search).get('path') ?? '/';
    cb({ location: { pathname: path } }, { locale: 'en' });
  },
  navigate: () => undefined,
};
