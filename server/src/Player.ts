import { Role, PlayerData } from './types';

export class Player {
  readonly id: string;
  name: string;
  role?: Role;
  isAlive: boolean;
  isConnected: boolean;

  constructor(id: string, name: string) {
    this.id = id;
    this.name = name;
    this.isAlive = true;
    this.isConnected = true;
  }

  assignRole(role: Role): void {
    this.role = role;
  }

  eliminate(): void {
    this.isAlive = false;
  }

  setConnected(connected: boolean): void {
    this.isConnected = connected;
  }

  toData(): PlayerData {
    return {
      id: this.id,
      name: this.name,
      role: this.role,
      isAlive: this.isAlive,
      isConnected: this.isConnected
    };
  }

  toPublicData(): PlayerData {
    return {
      id: this.id,
      name: this.name,
      isAlive: this.isAlive,
      isConnected: this.isConnected
    };
  }
}
