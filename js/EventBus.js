// Singleton guaranteed across Vite HMR re-evaluations.
// In browser: stored on window so all module instances share one object.
// In Node/test: plain object (each test suite gets its own instance via vi.mock anyway).
const _make = () => ({
  _listeners: {},
  on(event, fn) {
    if (!this._listeners[event]) this._listeners[event] = [];
    this._listeners[event].push(fn);
  },
  off(event, fn) {
    if (!this._listeners[event]) return;
    this._listeners[event] = this._listeners[event].filter(f => f !== fn);
  },
  emit(event, data) {
    if (!this._listeners[event]) return;
    this._listeners[event].forEach(fn => fn(data));
  }
});

const EventBus = (typeof window !== 'undefined')
  ? (window.__EventBus ?? (window.__EventBus = _make()))
  : _make();

export default EventBus;
