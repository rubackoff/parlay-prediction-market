<template>
  <div class="p-4 space-y-4">
    <h2 class="text-xl font-semibold">Debug: Resolve & Books</h2>

    <div class="grid gap-3 md:grid-cols-2">
      <div class="space-y-2 p-3 border rounded">
        <label class="block text-sm font-medium">market_id</label>
        <input v-model="marketId" type="text" class="w-full border rounded px-2 py-1" placeholder="e.g. 516725" />
        <label class="block text-sm font-medium">event_slug</label>
        <input v-model="eventSlug" type="text" class="w-full border rounded px-2 py-1" placeholder="e.g. fed rate hike in 2025" />
        <div class="flex gap-2 pt-2">
          <button @click="doResolveByMarket" class="px-3 py-1 bg-blue-600 text-white rounded">Resolve by market_id</button>
          <button @click="doResolveBySlug" class="px-3 py-1 bg-blue-600 text-white rounded">Resolve by event_slug</button>
        </div>
      </div>

      <div class="space-y-2 p-3 border rounded">
        <label class="block text-sm font-medium">token_ids (через запятую)</label>
        <input v-model="tokenIdsRaw" type="text" class="w-full border rounded px-2 py-1" placeholder="<TOKEN_ID_1>,<TOKEN_ID_2>" />
        <div class="flex gap-2 pt-2">
          <button @click="doBooksByTokens" class="px-3 py-1 bg-emerald-600 text-white rounded">Books by token_ids</button>
          <button @click="doBooksByMarket" class="px-3 py-1 bg-emerald-600 text-white rounded">Books by market_id</button>
        </div>
      </div>
    </div>

    <div class="grid gap-3 md:grid-cols-2">
      <div class="p-3 border rounded">
        <div class="font-medium pb-2">Resolve result</div>
        <pre class="text-xs overflow-auto max-h-80">{{ pretty(resolveOut) }}</pre>
        <div v-if="resolveOut?.clobTokenIds?.length" class="pt-3 space-y-2">
          <div class="text-sm font-medium">Quick: запросить книги по токенам</div>
          <div class="flex flex-wrap gap-2">
            <button
              v-for="(tid,i) in resolveOut.clobTokenIds"
              :key="tid"
              @click="booksBySingleToken(tid)"
              class="px-2 py-1 text-xs bg-slate-700 text-white rounded"
            >{{ outcomeLabel(i) }}: {{ short(tid) }}</button>
            <button @click="doBooksByResolved()" class="px-2 py-1 text-xs bg-indigo-600 text-white rounded">Все токены</button>
          </div>
        </div>
      </div>
      <div class="p-3 border rounded">
        <div class="font-medium pb-2">Books result</div>
        <div v-if="Array.isArray(booksOut?.books)" class="overflow-auto">
          <table class="min-w-full text-sm">
            <thead>
              <tr class="text-left border-b">
                <th class="py-1 pr-2">Outcome</th>
                <th class="py-1 pr-2">Token</th>
                <th class="py-1 pr-2">bestBid</th>
                <th class="py-1 pr-2">bestAsk</th>
                <th class="py-1 pr-2">spread</th>
                <th class="py-1 pr-2">mid</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(b,idx) in booksOut.books" :key="b.id" class="border-b">
                <td class="py-1 pr-2">{{ mappingOutcomeName(idx) }}</td>
                <td class="py-1 pr-2">{{ short(b.id) }}</td>
                <td class="py-1 pr-2">{{ fmt(b.bestBid) }}</td>
                <td class="py-1 pr-2">{{ fmt(b.bestAsk) }}</td>
                <td class="py-1 pr-2">{{ fmt(b.spread) }}</td>
                <td class="py-1 pr-2">{{ fmt(b.mid) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <pre v-else class="text-xs overflow-auto max-h-80">{{ pretty(booksOut) }}</pre>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'

// Use env-provided API base in deploy, fallback to local backend
// e.g. VITE_API_BASE=https://parlay-backend.onrender.com
const API = (import.meta as any).env?.VITE_API_BASE || 'http://localhost:3002'

const marketId = ref('')
const eventSlug = ref('')
const tokenIdsRaw = ref('')

const resolveOut = ref<any>(null)
const booksOut = ref<any>(null)

function pretty(v: any) {
  try { return JSON.stringify(v, null, 2) } catch { return String(v) }
}

function short(v: string) { return v?.slice(0, 6) + '…' + v?.slice(-4) }
function outcomeLabel(i: number) { return i === 0 ? 'YES' : (i === 1 ? 'NO' : `#${i+1}`) }
function mappingOutcomeName(idx: number) {
  const m = booksOut.value?.mapping?.[idx]?.outcome_name
  return m || outcomeLabel(idx)
}
function fmt(n: any) { return typeof n === 'number' ? n.toFixed(4) : n }

async function doResolveByMarket() {
  resolveOut.value = { loading: true }
  const url = `${API}/api/resolve?market_id=${encodeURIComponent(marketId.value.trim())}`
  const res = await fetch(url)
  resolveOut.value = await res.json()
}

async function doResolveBySlug() {
  resolveOut.value = { loading: true }
  const url = `${API}/api/resolve?event_slug=${encodeURIComponent(eventSlug.value.trim())}`
  const res = await fetch(url)
  resolveOut.value = await res.json()
}

async function doBooksByTokens() {
  booksOut.value = { loading: true }
  const ids = tokenIdsRaw.value.split(',').map(s => s.trim()).filter(Boolean)
  const res = await fetch(`${API}/api/books`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token_ids: ids })
  })
  booksOut.value = await res.json()
}

async function doBooksByMarket() {
  booksOut.value = { loading: true }
  const res = await fetch(`${API}/api/books`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ market_id: marketId.value.trim() })
  })
  booksOut.value = await res.json()
}

async function doBooksByResolved() {
  if (!resolveOut.value?.clobTokenIds?.length) return
  booksOut.value = { loading: true }
  const res = await fetch(`${API}/api/books`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token_ids: resolveOut.value.clobTokenIds })
  })
  booksOut.value = await res.json()
}

async function booksBySingleToken(tid: string) {
  booksOut.value = { loading: true }
  const res = await fetch(`${API}/api/books`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token_ids: [tid] })
  })
  booksOut.value = await res.json()
}
</script>

<style scoped>
</style>
