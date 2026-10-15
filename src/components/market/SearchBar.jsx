import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useDebouncedValue } from '../../hooks/useDebouncedValue.js'
import { useUiStore } from '../../store/uiStore.js'
import { CloseIcon, SearchIcon } from '../ui/Icons.jsx'

/**
 * Debounced, live market search. Several instances can coexist (header and
 * mobile toolbar); they stay in sync through the shared UI store.
 */
export default function SearchBar({ navigateOnType = false, className = '' }) {
  const query = useUiStore((s) => s.query)
  const setQuery = useUiStore((s) => s.setQuery)
  const [text, setText] = useState(query)
  const debounced = useDebouncedValue(text, 200)
  const navigate = useNavigate()
  const { pathname } = useLocation()

  const typed = useRef(false)

  useEffect(() => {
    if (!typed.current || debounced !== text) return
    typed.current = false
    if (debounced !== useUiStore.getState().query) setQuery(debounced)
  }, [debounced, text, setQuery])

  const [lastQuery, setLastQuery] = useState(query)
  if (lastQuery !== query) {
    setLastQuery(query)
    if (query !== text) setText(query)
  }

  const onChange = (e) => {
    typed.current = true
    setText(e.target.value)
    if (navigateOnType && pathname !== '/') navigate('/')
  }

  const clear = () => {
    typed.current = false
    setText('')
    setQuery('')
  }

  return (
    <div className={`relative ${className}`} role="search">
      <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle" />
      <label className="sr-only" htmlFor={navigateOnType ? 'search-header' : 'search-page'}>
        Search markets
      </label>
      <input
        id={navigateOnType ? 'search-header' : 'search-page'}
        type="search"
        value={text}
        onChange={onChange}
        onKeyDown={(e) => e.key === 'Escape' && text && clear()}
        placeholder="Search markets"
        autoComplete="off"
        className="input h-10 py-2 pr-9 pl-9 [&::-webkit-search-cancel-button]:hidden"
      />
      {text && (
        <button
          type="button"
          onClick={clear}
          className="absolute top-1/2 right-2 -translate-y-1/2 rounded-md p-1 text-subtle hover:bg-surface-3 hover:text-fg"
          aria-label="Clear search"
        >
          <CloseIcon className="size-4" />
        </button>
      )}
    </div>
  )
}
