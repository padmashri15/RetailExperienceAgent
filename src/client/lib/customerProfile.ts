import type { CustomerProfile } from "../../shared/types";

export const customerProfileStorageKey = "brand-experience-agent.customer-profile";

export const defaultCustomerProfile: CustomerProfile = {
  id: "cust-default-member",
  name: "John Doe",
  ageGroup: "35-44",
  budget: 150,
  location: "San Jose, CA",
  preferences: ["travel", "layering", "premium"],
  shoppingHistory: ["Weekender tote comparison", "Merino hoodie review"],
  purchaseIntent: "comparing",
  loyaltyTier: "gold"
};

export function readStoredCustomerProfile(): CustomerProfile {
  if (typeof window === "undefined") return defaultCustomerProfile;

  const storedProfile = window.localStorage.getItem(customerProfileStorageKey);
  if (!storedProfile) {
    window.localStorage.setItem(customerProfileStorageKey, JSON.stringify(defaultCustomerProfile));
    return defaultCustomerProfile;
  }

  try {
    const parsedProfile = JSON.parse(storedProfile) as Partial<CustomerProfile>;
    if (isLegacyMarathonDefault(parsedProfile)) {
      window.localStorage.setItem(customerProfileStorageKey, JSON.stringify(defaultCustomerProfile));
      return defaultCustomerProfile;
    }

    const normalizedProfile = {
      ...defaultCustomerProfile,
      ...parsedProfile
    };
    if (normalizedProfile.id === defaultCustomerProfile.id) {
      normalizedProfile.name = "John Doe";
    }

    if (normalizedProfile.name !== parsedProfile.name) {
      window.localStorage.setItem(customerProfileStorageKey, JSON.stringify(normalizedProfile));
    }

    return normalizedProfile;
  } catch {
    window.localStorage.setItem(customerProfileStorageKey, JSON.stringify(defaultCustomerProfile));
    return defaultCustomerProfile;
  }
}

export function storeCustomerProfile(profile: CustomerProfile) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(customerProfileStorageKey, JSON.stringify(profile));
}

function isLegacyMarathonDefault(profile: Partial<CustomerProfile>) {
  return (
    profile.id === "cust-default-member" &&
    profile.name === "John Doe" &&
    JSON.stringify(profile.preferences ?? []) === JSON.stringify(["marathon", "breathable", "hydration"])
  );
}
