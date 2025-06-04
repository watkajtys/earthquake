import React, { useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';

const Block = ({ position, size, color }) => {
  return (
    <mesh position={position}>
      <boxGeometry args={size} />
      <meshStandardMaterial color={color} />
    </mesh>
  );
};

const FaultAnimationNormal = ({
  dimensions = { width: 2, height: 1, depth: 1 },
  colors = { footwall: 'brown', hangingwall: 'saddlebrown' },
  isPlaying = false,
  animationSpeed = 0.01,
}) => {
  const hangingWallRef = useRef();
  const initialHangingWallY = 0.5; // Start slightly offset for visual separation
  const targetHangingWallY = initialHangingWallY - dimensions.height * 0.5; // Move down by half its height

  useFrame(() => {
    if (isPlaying && hangingWallRef.current) {
      if (hangingWallRef.current.position.y > targetHangingWallY) {
        hangingWallRef.current.position.y -= animationSpeed;
      }
    } else if (!isPlaying && hangingWallRef.current) {
      // Reset position when not playing
      if (hangingWallRef.current.position.y < initialHangingWallY) {
        hangingWallRef.current.position.y += animationSpeed * 2; // Faster reset
      }
      if (hangingWallRef.current.position.y > initialHangingWallY) {
          hangingWallRef.current.position.y = initialHangingWallY;
      }
    }
  });

  const faultAngle = Math.PI / 6; // 30 degrees, typical for normal faults
  const footwallXOffset = - (dimensions.width / 4) * Math.cos(faultAngle);
  const hangingWallXOffset = (dimensions.width / 4) * Math.cos(faultAngle);
  const hangingWallYOffset = initialHangingWallY - (dimensions.width / 4) * Math.sin(faultAngle);


  return (
    <div style={{ height: '200px', width: '300px', border: '1px solid black' }}>
      {!isPlaying && (
        <div style={{ textAlign: 'center', paddingTop: '90px', position: 'absolute', width: '100%'}}>
          Click to animate fault (Normal)
        </div>
      )}
      <Canvas camera={{ position: [0, 1, 5], fov: 50 }}>
        <ambientLight intensity={0.5} />
        <directionalLight position={[10, 10, 5]} intensity={1} />
        <Block
          position={[footwallXOffset, 0, 0]}
          size={[dimensions.width / 2, dimensions.height, dimensions.depth]}
          color={colors.footwall}
        />
        <mesh ref={hangingWallRef} position={[hangingWallXOffset, hangingWallYOffset, 0]}>
          <boxGeometry args={[dimensions.width / 2, dimensions.height, dimensions.depth]} />
          <meshStandardMaterial color={colors.hangingwall} />
          {/* Simple representation of the fault plane incline */}
           <mesh rotation-z={-faultAngle} position={[-(dimensions.width / 4) , dimensions.height /2, dimensions.depth/2 + 0.01]} >
             <planeGeometry args={[0.1, dimensions.depth]} />
             <meshStandardMaterial color="gray" side={THREE.DoubleSide} />
           </mesh>
        </mesh>
      </Canvas>
    </div>
  );
};

export default FaultAnimationNormal;
