// Local development switch. `import.meta.env.DEV` is false in every build, so a production
// release never takes this path, whatever ENVIRONMENT is set to on the build machine.
export function isDevelopment(): boolean {
  return import.meta.env.DEV && typeof process !== 'undefined' && process.env.ENVIRONMENT === 'development';
}
