// Two small subagent transcripts, as Claude Code writes them under <session>/subagents/, for tests.

type Tokens = [input: number, cacheWrite: number, cacheRead: number, output: number]

const reply = (id: string, block: string, [input, write, read, output]: Tokens) =>
  JSON.stringify({
    type: 'assistant',
    isSidechain: true,
    requestId: `req_${id}`,
    message: {
      id,
      role: 'assistant',
      model: 'claude-haiku-5-5',
      content: [{ type: block }],
      usage: { input_tokens: input, cache_creation_input_tokens: write, cache_read_input_tokens: read, output_tokens: output },
    },
  })
const user = (content: string) => JSON.stringify({ type: 'user', isSidechain: true, message: { role: 'user', content } })

// Two steps. The first reply came as two lines (thinking, then a tool call), only the last with its
// final output count; a tool result in between quotes a reply line.
export const AGENT_A = `${[
  user('Review task 5'),
  reply('msg_1', 'thinking', [10, 1000, 2000, 3]),
  reply('msg_1', 'tool_use', [10, 1000, 2000, 50]),
  user('{"type":"assistant"}'),
  reply('msg_2', 'text', [5, 500, 3000, 20]),
].join('\n')}\n`
export const META_A = JSON.stringify({ agentType: 'general-purpose', description: 'Review task 5' })

// One step, then a line the agent is still writing.
export const AGENT_B = [user('Search code'), reply('msg_3', 'text', [2, 8000, 0, 100]), '{"type":"assistant","message":{"id":"msg_4",'].join('\n')
export const META_B = JSON.stringify({ agentType: 'Explore', description: 'Search code' })
