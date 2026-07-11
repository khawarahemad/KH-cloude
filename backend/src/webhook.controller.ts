import { Controller, Post, Body, Headers } from '@nestjs/common';
import { ProjectsService } from './projects/projects.service';

@Controller()
export class WebhookController {
  constructor(private projects: ProjectsService) {}

  @Post('github/webhook')
  async handleGithubWebhook(
    @Body() payload: any,
    @Headers('x-github-event') event: string
  ) {
    if (event === 'push') {
      const repoFullName = payload.repository?.full_name;
      const ref = payload.ref; // e.g. refs/heads/main
      if (repoFullName && ref) {
        const branch = ref.replace('refs/heads/', '');
        await this.projects.triggerGitOpsDeployment(repoFullName, branch);
      }
    }
    return { received: true };
  }
}
