export type NewUser = {
  firstName: string;
  lastName: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
  phone: string;
  ssn: string;
  username: string;
  password: string;
};

export function newUser(): NewUser {
  const suffix = `${Date.now()}${Math.floor(Math.random() * 1_000)}`;
  return {
    firstName: 'Test',
    lastName: `User${suffix.slice(-6)}`,
    address: '1 Test Street',
    city: 'Testville',
    state: 'CA',
    zipCode: '90001',
    phone: '5551234567',
    ssn: '123-45-6789',
    username: `pw_${suffix}`,
    password: 'Passw0rd!',
  };
}
