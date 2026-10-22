// Production entry point. Sets the flag before the app is loaded, so it
// works the same on Windows and Linux without an extra dependency.
process.env.NODE_ENV = 'production'
await import('./index.js')
