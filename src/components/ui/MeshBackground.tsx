import React from 'react';

export const MeshBackground = () => {
  return (
    <div className="mesh-gradient-bg">
      {/* Circle 1 - Primary Teal */}
      <div 
        className="mesh-circle bg-primary" 
        style={{ 
          width: '50vw', 
          height: '50vw', 
          top: '-10%', 
          left: '-10%', 
          animationDelay: '0s' 
        }} 
      />
      {/* Circle 2 - Secondary Teal */}
      <div 
        className="mesh-circle bg-secondary" 
        style={{ 
          width: '40vw', 
          height: '40vw', 
          bottom: '10%', 
          right: '-5%', 
          animationDelay: '-5s' 
        }} 
      />
      {/* Circle 3 - Accent Light Teal */}
      <div 
        className="mesh-circle bg-accent" 
        style={{ 
          width: '30vw', 
          height: '30vw', 
          top: '20%', 
          right: '20%', 
          animationDelay: '-10s' 
        }} 
      />
    </div>
  );
};
