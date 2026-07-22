import { useEffect, useState } from "react";
import { api } from "./api.js";

export function useBranding() {
  const [branding, setBranding] = useState({ name: "Site Monitor", logoUrl: "" });

  useEffect(() => {
    api.branding().then(setBranding);
  }, []);

  return branding;
}
