// Brand is configuration, not logic: change names/logo here or via env.
export const brand = {
  name: {
    ar: process.env.NEXT_PUBLIC_BRAND_NAME_AR || "جست كلين",
    ur: process.env.NEXT_PUBLIC_BRAND_NAME_UR || "جسٹ کلین",
  },
  latinName: process.env.NEXT_PUBLIC_BRAND_NAME_EN || "Just Clean",
  logo: "/logo.png",
  themeColor: "#0b2e5c",
};
