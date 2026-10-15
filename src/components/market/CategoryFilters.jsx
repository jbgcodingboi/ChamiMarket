import { CATEGORIES } from '../../config.js'
import Tabs from '../ui/Tabs.jsx'

export default function CategoryFilters({ value, onChange, counts }) {
  const tabs = [
    { id: 'all', label: 'All', count: counts.all },
    ...CATEGORIES.map((c) => ({ id: c.id, label: c.label, count: counts[c.id] })),
  ]
  return <Tabs tabs={tabs} value={value} onChange={onChange} label="Market category" />
}
