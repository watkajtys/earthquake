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

const FaultAnimationStrikeSlip = ({
  dimensions = { width: 2, height: 1, depth: 1 }, // Total width of the two blocks
  colors = { block1: 'lightsalmon', block2: 'rosybrown' },
  isPlaying = false,
  animationSpeed = 0.01,
}) => {
  const block1Ref = useRef();
  const block2Ref = useRef();

  const initialBlock1X = -dimensions.width / 4;
  const targetBlock1X = initialBlock1X - dimensions.width / 4; // Moves to the left

  const initialBlock2X = dimensions.width / 4;
  const targetBlock2X = initialBlock2X + dimensions.width / 4; // Moves to the right

  useFrame(() => {
    if (isPlaying) {
      if (block1Ref.current && block1Ref.current.position.x > targetBlock1X) {
        block1Ref.current.position.x -= animationSpeed;
      }
      if (block2Ref.current && block2Ref.current.position.x < targetBlock2X) {
        block2Ref.current.position.x += animationSpeed;
      }
    } else {
      // Reset positions
      if (block1Ref.current && block1Ref.current.position.x < initialBlock1X) {
        block1Ref.current.position.x += animationSpeed * 2; // Faster reset
      }
      if (block1Ref.current && block1Ref.current.position.x > initialBlock1X) {
        block1Ref.current.position.x = initialBlock1X;
      }

      if (block2Ref.current && block2Ref.current.position.x > initialBlock2X) {
        block2Ref.current.position.x -= animationSpeed * 2; // Faster reset
      }
      if (block2Ref.current && block2Ref.current.position.x < initialBlock2X) {
        block2Ref.current.position.x = initialBlock2X;
      }
    }
  });

  return (
    <div style={{ height: '200px', width: '300px', border: '1px solid black' }}>
      {!isPlaying && (
        <div style={{ textAlign: 'center', paddingTop: '90px', position: 'absolute', width: '100%'}}>
          Click to animate fault (Strike-Slip)
        </div>
      )}
      <Canvas camera={{ position: [0, 2, 3], fov: 60 }}> {/* Adjusted camera for better view */}
        <ambientLight intensity={0.6} />
        <directionalLight position={[10, 10, 5]} intensity={1} />
        <mesh ref={block1Ref} position={[initialBlock1X, 0, 0]}>
          <boxGeometry args={[dimensions.width / 2, dimensions.height, dimensions.depth]} />
          <meshStandardMaterial color={colors.block1} />
        </mesh>
        <mesh ref={block2Ref} position={[initialBlock2X, 0, 0]}>
          <boxGeometry args={[dimensions.width / 2, dimensions.height, dimensions.depth]} />
          <meshStandardMaterial color={colors.block2} />
        </mesh>
        {/* Optional: Visual indicator of the fault line */}
        <mesh position={[0, -dimensions.height / 2 + 0.01 ,0]} rotation-x={-Math.PI /2} >
            <planeGeometry args={[0.05, dimensions.depth*1.5]}/>
            <meshStandardMaterial color="darkgrey" side={THREE.DoubleSide} />
        </mesh>
      </Canvas>
    </div>
  );
};

export default FaultAnimationStrikeSlip;
