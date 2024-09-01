import { configureStore } from '@reduxjs/toolkit'

import CustomersReducer from './Custormer'
import TemplatesReducer from './Template'

export type stateType = ReturnType<typeof store.getState>

const store = configureStore({
  reducer: {
    customers: CustomersReducer,
    templates: TemplatesReducer,
  },
})

export default store
