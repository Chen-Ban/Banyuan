import { useRequest } from 'ahooks'
import { printService } from 'src/services/print'

export default () => {
  const { run, loading } = useRequest(printService, {
    manual: true,
    onSuccess() {},
  })
  return {
    run,
    loading,
  }
}
