import React from 'react';
import GameCanvas from './components/GameCanvas';

const App: React.FC = () => {
  return (
    <div className="w-screen h-screen overflow-hidden bg-pink-50">
      <GameCanvas />
    </div>
  );
};

export default App;