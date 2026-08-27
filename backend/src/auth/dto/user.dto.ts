export class UserDto {
  id: string;
  name: string;
  email: string;
  role: string;
  avatar: string | null;
  githubUsername: string | null;
  discordNotifyDeploys: boolean;
  discordNotifyErrors: boolean;
  discordNotifyDatabases: boolean;
  createdAt: Date;

  static from(user: any): UserDto {
    const dto = new UserDto();
    dto.id = user.id;
    dto.name = user.name;
    dto.email = user.email;
    dto.role = user.role ?? 'USER';
    dto.avatar = user.avatar ?? null;
    dto.githubUsername = user.githubUsername ?? null;
    dto.discordNotifyDeploys = user.discordNotifyDeploys ?? true;
    dto.discordNotifyErrors = user.discordNotifyErrors ?? true;
    dto.discordNotifyDatabases = user.discordNotifyDatabases ?? true;
    dto.createdAt = user.createdAt;
    return dto;
  }
}
