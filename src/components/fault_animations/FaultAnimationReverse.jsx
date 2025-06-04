import React, { useRef } from 'react';
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

const FaultAnimationReverse = ({
  dimensions = { width: 2, height: 1, depth: 1 },
  colors = { footwall: 'brown', hangingwall: 'saddlebrown' },
  isPlaying = false,
  animationSpeed = 0.01,
}) => {
  const hangingWallRef = useRef();
  // Initial Y position of the hanging wall, slightly above for visual separation before animation
  const initialHangingWallY = 0.5;
  // Target Y position for the hanging wall: moves up by half its height
  const targetHangingWallY = initialHangingWallY + dimensions.height * 0.5;

  useFrame(() => {
    if (hangingWallRef.current) {
      if (isPlaying) {
        if (hangingWallRef.current.position.y < targetHangingWallY) {
          hangingWallRef.current.position.y += animationSpeed;
        }
      } else {
        // Reset position when not playing
        if (hangingWallRef.current.position.y > initialHangingWallY) {
          hangingWallRef.current.position.y -= animationSpeed * 2; // Faster reset
        }
        if (hangingWallRef.current.position.y < initialHangingWallY) {
            hangingWallRef.current.position.y = initialHangingWallY;
        }
      }
    }
  });

  // Steeper angle for reverse faults, e.g., 45 degrees
  const faultAngle = Math.PI / 4;
  const footwallXOffset = (dimensions.width / 4) * Math.cos(faultAngle); // Footwall on the right
  const hangingWallXOffset = -(dimensions.width / 4) * Math.cos(faultAngle); // Hanging wall on the left, to move up
  // Adjust initial Y position based on the fault angle, so it sits correctly on the footwall
  const initialYOffsetDueToAngle = (dimensions.width / 4) * Math.sin(faultAngle);
  const adjustedInitialHangingWallY = initialHangingWallY + initialYOffsetDueToAngle;


  return (
    <div style={{ height: '200px', width: '300px', border: '1px solid black' }}>
      {!isPlaying && (
        <div style={{ textAlign: 'center', paddingTop: '90px', position: 'absolute', width: '100%'}}>
          Click to animate fault (Reverse)
        </div>
      )}
      <Canvas camera={{ position: [0, 1, 5], fov: 50 }}>
        <ambientLight intensity={0.5} />
        <directionalLight position={[10, 10, 5]} intensity={1} />
        <Block
          position={[footwallXOffset, 0, 0]} // Footwall doesn't move
          size={[dimensions.width / 2, dimensions.height, dimensions.depth]}
          color={colors.footwall}
        />
        <mesh ref={hangingWallRef} position={[hangingWallXOffset, adjustedInitialHangingWallY, 0]}>
          <boxGeometry args={[dimensions.width / 2, dimensions.height, dimensions.depth]} />
          <meshStandardMaterial color={colors.hangingwall} />
          {/* Simple representation of the fault plane incline for reverse fault */}
          {/* Positioned to align with the contact point of the blocks */}
           <mesh rotation-z={faultAngle} position={[(dimensions.width / 4) , -dimensions.height/2 + initialYOffsetDueToAngle, dimensions.depth/2 + 0.01]} >
             <planeGeometry args={[0.1, dimensions.depth]} />
             <meshStandardMaterial color="gray" side={THREE.DoubleSide} />
           </mesh>
        </mesh>
      </Canvas>
    </div>
  );
};

export default FaultAnimationReverse;
