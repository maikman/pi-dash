import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import type { FC } from 'hono/jsx'
import { Octokit } from '@octokit/core'
import { css, Style } from 'hono/css'

require('dotenv').config()

const app = new Hono()

const Layout: FC = (props) => {
  return (
    <html>
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Roboto+Mono:wght@400;700&display=swap"
          rel="stylesheet"
        ></link>
        <Style>{css`
          .grid-container {
            display: grid;
            grid-template-columns: 1fr 1fr;
            grid-gap: 2px;
            width: 100%;
            margin: auto;
            color: white;
            font-family: 'Roboto Mono', monospace;
          }

          .grid-item {
            border: 2px solid transparent;
            display: flex;
            justify-content: center;
            align-items: center;
            font-size: 9rem;
            height: 160px;
            box-sizing: border-box;
          }

          .green-box {
            background-color: #26392f;
          }

          .warn-box {
            background-color: red;
          }

          .grid-item:nth-child(odd) {
            border-right-color: black; /* Right border for odd items */
          }

          .grid-item:nth-child(-n + 2) {
            border-bottom-color: black; /* Bottom border for first row items */
          }
        `}</Style>
        <meta http-equiv="refresh" content="10"></meta>
        <title>PR Watcher</title>
      </head>
      <body>{props.children}</body>
    </html>
  )
}

const PullRequestCount: FC<{
  all: number
  assignedToMe: number
  myPullRequests: number
  myApprovedPullRequests: number
}> = (props: {
  all: number
  assignedToMe: number
  myPullRequests: number
  myApprovedPullRequests: number
}) => {
  const ok = 'green-box'
  const warn = 'warn-box'
  const allPullRequestsStyle = `grid-item ${props.all >= 10 ? warn : ok}`
  const assignedToMeStyle = `grid-item ${props.assignedToMe > 0 ? warn : ok}`
  const myPullRequestsStyle = `grid-item ${
    props.myPullRequests > 1 ? warn : ok
  }`
  const myApprovedPullRequestsStyle = `grid-item ${
    props.myApprovedPullRequests > 0 ? warn : ok
  }`
  return (
    <Layout>
      <div class="grid-container">
        <div class={allPullRequestsStyle}>{props.all}</div>
        <div class={assignedToMeStyle}>{props.assignedToMe}</div>
        <div class={myPullRequestsStyle}>{props.myPullRequests}</div>
        <div class={myApprovedPullRequestsStyle}>
          {props.myApprovedPullRequests}
        </div>
      </div>
    </Layout>
  )
}

app.get('/health', async (c) => {
  console.log('Health check 1', process.env.NODE_ENV)
  console.log('Health check', process.env.OWNER)
  return c.text('OK')
})

app.get('/', async (c) => {
  const octokit = new Octokit({
    auth: process.env.GITHUB_TOKEN,
  })

  const { data } = await octokit.request('GET /repos/{owner}/{repo}/pulls', {
    owner: process.env.OWNER!,
    repo: process.env.REPO!,
    state: 'open',
    draft: false,
  })

  const allPullRequests = data.filter((pr) => pr.draft === false)

  const assignedToMe = allPullRequests.filter(
    (pr) =>
      pr.requested_reviewers &&
      !!pr.requested_reviewers.find((r) => r.login === process.env.LOGIN),
  )

  const myPullRequests = allPullRequests.filter(
    (pr) => pr.user?.login === process.env.LOGIN,
  )

  const myApprovedPullRequests = await Promise.all(
    myPullRequests.map((pr) => {
      return octokit.request(
        `GET /repos/{owner}/{repo}/pulls/{pull_number}/reviews`,
        {
          owner: process.env.OWNER!,
          repo: process.env.REPO!,
          state: 'open',
          draft: false,
          pull_number: pr.number,
        },
      )
    }),
  ).then((prs) => {
    return prs.filter((pr) => {
      return pr.data.some((review) => review.state === 'APPROVED')
    })
  })

  c.header('Cache-Control', 'no-cache')

  return c.html(
    <PullRequestCount
      all={allPullRequests.length}
      assignedToMe={assignedToMe.length}
      myPullRequests={myPullRequests.length}
      myApprovedPullRequests={myApprovedPullRequests.length}
    />,
  )
})

const port = 3099
console.log(`Server is running on port ${port}`)

serve({
  fetch: app.fetch,
  port,
})
