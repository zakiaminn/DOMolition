# DOMolition

> *"Because sometimes the only valid response to centering a div is blowing up the entire UI."*

DOMolition is a React-based physics engine wrapper that converts standard DOM elements into a rigid-body physics simulation. It is designed to provide an interactive "rage quit" UI mechanism by capturing the visual state of a component tree and shattering it dynamically on an HTML5 canvas.

## Architecture

The underlying system operates in three distinct phases:

1. **Capture Phase**: Utilizes `html2canvas` to perform a deep traversal of the target DOM node, resolving computed styles (including advanced CSS color spaces) and generating a high-fidelity static bitmap.
2. **Kinematic Phase**: Integrates `matter-js` to compute rigid body dynamics. The source bitmap is subdivided into a discrete Cartesian grid (`rows` x `cols`). Each subdivision is instantiated as a rectangular physical body with its own mass, restitution, and friction properties. An initial radial force vector is applied to simulate an outward kinetic explosion.
3. **Render Pipeline**: The original DOM element is visually hidden, and a full-viewport overlay canvas is injected into the DOM. A synchronized `requestAnimationFrame` loop paints the corresponding bitmap slices according to the translation and rotation matrices calculated by the physics engine. The loop terminates automatically when all rigid bodies reach a velocity threshold indicative of a sleeping state.

## Installation

Install the package via npm:

```bash
npm install domolition
```

*Note: Ensure `react` and `react-dom` (v18.0.0 or higher) are installed in your project.*

## Usage

The library exposes a primary `RageQuitWrapper` component. The physics simulation can be controlled either declaratively via props or imperatively via a React Ref.

```tsx
import React, { useRef } from 'react';
import { RageQuitWrapper, RageQuitRef } from 'domolition';

export const Application = () => {
  const shatterRef = useRef<RageQuitRef>(null);

  const handleDestruction = () => {
    if (shatterRef.current) {
      shatterRef.current.triggerShatter();
    }
  };

  return (
    <main>
      <button onClick={handleDestruction}>
        Initiate Sequence
      </button>

      <RageQuitWrapper 
        ref={shatterRef} 
        rows={12} 
        cols={10}
        onShatterComplete={() => console.log('Simulation terminated.')}
      >
        <section style={{ padding: '2rem', border: '1px solid #ccc', background: '#fff' }}>
          <h1>System Dashboard</h1>
          <p>This interface remains fully functional until the destruction sequence is triggered.</p>
        </section>
      </RageQuitWrapper>
    </main>
  );
};
```

## API Reference

### `RageQuitWrapperProps`

| Property | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `children` | `React.ReactNode` | required | The DOM sub-tree to be captured and simulated. |
| `isShattered` | `boolean` | `false` | A declarative prop to trigger the shatter effect. |
| `rows` | `number` | `10` | The number of horizontal subdivisions for the physical grid. |
| `cols` | `number` | `8` | The number of vertical subdivisions for the physical grid. |
| `onShatterComplete` | `() => void` | `undefined` | Callback invoked when the kinetic energy of all rigid bodies falls below the minimum sleeping threshold. |

### `RageQuitRef` (Imperative API)

| Method | Signature | Description |
| :--- | :--- | :--- |
| `triggerShatter` | `() => void` | Imperatively triggers the capture and subsequent physics simulation. |

## Core Dependencies

- **matter-js**: Resolves 2D rigid body collisions and kinematics.
- **html2canvas**: Executes the target DOM bitmap rasterization.