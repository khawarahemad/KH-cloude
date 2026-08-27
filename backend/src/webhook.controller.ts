import { Controller, Post, Body, Headers, Req, UnauthorizedException } from '@nestjs/common';
import { ProjectsService } from './projects/projects.service';
import { GithubAppService } from './github-app/github-app.service';

@Controller()
export class WebhookController {
  constructor(
    private projects: ProjectsService,
    private githubApp: GithubAppService
  ) {}

  @Post('github/webhook')
  async handleGithubWebhook(
    @Body() payload: any,
    @Headers('x-github-event') event: string,
    @Headers('x-hub-signature-256') signature: string,
    @Req() req: any
  ) {
    if (!signature || !this.githubApp.verifyWebhookSignature(req.rawBody, signature)) {
      throw new UnauthorizedException('Invalid webhook signature');
    }

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
