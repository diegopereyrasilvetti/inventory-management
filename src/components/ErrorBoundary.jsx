import { Component } from "react";

/** Si un componente falla al dibujarse, muestra el error en pantalla en vez de dejarla en blanco. */
export default class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("Error en la app:", error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="mx-auto mt-16 max-w-xl rounded-2xl border border-(--borde) bg-(--superficie) p-6 text-(--texto)">
        <h1 className="text-xl font-bold">Algo salió mal</h1>
        <p className="mt-2 text-sm text-(--texto-suave)">
          La pantalla no pudo dibujarse. Probá recargar la página. Si se repite, copiá este mensaje:
        </p>
        <pre className="mt-3 overflow-auto rounded-lg bg-(--fondo) p-3 text-xs text-(--stock-agotado)">
          {String(this.state.error?.stack || this.state.error)}
        </pre>
        <button
          className="mt-4 rounded-full bg-(--boton) px-5 py-2 text-sm font-semibold text-white cursor-pointer hover:bg-(--boton-hover)"
          type="button"
          onClick={() => window.location.reload()}
        >
          Recargar
        </button>
      </div>
    );
  }
}
