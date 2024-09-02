import axiosInstance from './ajax'

export type PrintReqType = {
  imgData: Array<number>
}
export const printService = async ({ imgData }: PrintReqType): Promise<boolean> => {
  return await axiosInstance.post('/api/print', { imgData })
}
