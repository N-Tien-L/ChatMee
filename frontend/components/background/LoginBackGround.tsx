import React from "react";

import { DarkVeilBackground } from "@/components/ui/shadcn-io/dark-veil-background";

const LoginBackGround = () => {
  return (
    <div className="relative w-full h-full bg-black rounded-lg overflow-hidden">
      <DarkVeilBackground
        hueShift={45}
        scanlineIntensity={0.1}
        scanlineFrequency={2.0}
        noiseIntensity={0.05}
        warpAmount={1.0}
      />
    </div>
  );
};

export default LoginBackGround;
