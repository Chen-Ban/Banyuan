import React from 'react'
import { useState, useEffect } from 'react'
import { Input } from 'antd'
import type { ChangeEvent } from 'react'
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom'
import { SEARCH_PARAM_KEY } from 'constants/constant'
const { Search: _Search } = Input

export default function Search() {
  const [val, setVal] = useState('')
  const nav = useNavigate()
  const [searchParams] = useSearchParams()
  const { pathname } = useLocation()

  useEffect(() => {
    setVal(searchParams.get(SEARCH_PARAM_KEY) || '')
  }, [searchParams])

  const onSearch = (v: string) => {
    console.log(v)
    nav({
      pathname,
      search: v && `${SEARCH_PARAM_KEY}=${v}`,
    })
  }
  const onChange = (e: ChangeEvent<HTMLInputElement>) => {
    console.log(e.target.value)
    setVal(e.target.value)
  }
  return (
    <_Search
      placeholder="输入用户姓名"
      value={val}
      onSearch={onSearch}
      onChange={onChange}
      allowClear
      style={{ width: '200px' }}
    ></_Search>
  )
}
