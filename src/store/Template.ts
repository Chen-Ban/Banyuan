import { createSlice, PayloadAction } from '@reduxjs/toolkit'
import { cloneDeep } from 'lodash'
import {
  CanvasNode,
  Template,
  initialTemplates,
  Selection,
  RenderTextOptions,
  NodeType,
} from 'store/types/Template.type'
import { TemplateData } from './types/TemplateData.type'

const TemplateSlice = createSlice({
  name: 'templates',
  initialState: initialTemplates,
  reducers: {
    // 重置模板信息
    resetTemplate: (_, action: PayloadAction<Template[]>) => {
      // const templates = action.payload
      // for (const template of templates) {
      //   for (const node of template.nodeList) {
      //     if (node.type == NodeType.TEXT) {
      //       const fontMap = new Map()
      //       for (const [selection, fontOptios] of Object.entries((node.options as RenderTextOptions).font)) {
      //         fontMap.set(
      //           selection.split(',').map((item) => parseInt(item)),
      //           fontOptios,
      //         )
      //       }
      //       ;(node.options as RenderTextOptions).font = fontMap
      //     }
      //   }
      // }
      return action.payload
    },
    // 更新整个模板信息
    updateTemplate: (templates: Template[], action: PayloadAction<Template>) => {
      return templates.map((template) => {
        if (template.templateId == action.payload.templateId) {
          return action.payload
        } else {
          return template
        }
      })
    },

    //向某个模板添加一个节点,同时还要修改templateData中的数据
    patchTemplateNodeList(
      templates: Template[],
      action: PayloadAction<{
        templateId: Template['templateId']
        node: CanvasNode
        templateDataItem: TemplateData[keyof TemplateData]
      }>,
    ) {
      const { templateId, templateDataItem, node } = action.payload
      templates.map((template) => {
        if (template.templateId == templateId) {
          template.nodeList.map((node) => (node.isActive = false))
          template.nodeList.push(node)
          template.nodeList[template.nodeList.length - 1].isActive = true
          template.templateData[node.propName] = templateDataItem
        }
      })
    },
    //激活节点，失活节点(传入要激活的节点实例id，激活这些id的节点，失活其他节点)
    updateNodeActivation(
      templates: Template[],
      action: PayloadAction<{
        templateId: Template['templateId']
        toActiveNodesId: CanvasNode['instanceId'][]
      }>,
    ) {
      const { templateId, toActiveNodesId } = action.payload
      return templates.map((template) => {
        if (template.templateId == templateId) {
          const nodeList = template.nodeList.map((node) => {
            const newNode = cloneDeep(node)
            if (toActiveNodesId.includes(node.instanceId)) {
              newNode.isActive = true
            } else {
              newNode.isActive = false
            }
            return newNode
          })

          return {
            ...template,
            nodeList,
          }
        } else {
          return template
        }
      })
    },
    //更新节点结构信息
    updateNodeStructure(
      templates: Template[],
      action: PayloadAction<{
        templateId: Template['templateId']
        instanceIds: CanvasNode['instanceId'][]
        structures: CanvasNode['structure'][]
      }>,
    ) {
      const { templateId, instanceIds, structures } = action.payload
      return templates.map((template) => {
        if (template.templateId == templateId) {
          return {
            ...template,
            nodeList: template.nodeList.map((node) => {
              const i = instanceIds.findIndex((instanceId) => instanceId == node.instanceId)
              if (i != -1) {
                return {
                  ...node,
                  structure: structures[i],
                }
              }
              return node
            }),
          }
        }
        return template
      })
    },
    //更新模板的装填数据
    updateTemplateData(
      templates: Template[],
      action: PayloadAction<{
        templateId: Template['templateId']
        propName: CanvasNode['propName']
        propData: TemplateData[keyof TemplateData]
      }>,
    ) {
      const { propName, propData, templateId } = action.payload
      return templates.map((template) => {
        if (template.templateId == templateId) {
          return {
            ...template,
            templateData: {
              ...template.templateData,
              [propName]: propData,
            },
          }
        }
        return template
      })
    },
    //更新节点样式
    updateNodeOptions(
      templates: Template[],
      action: PayloadAction<{
        templateId: Template['templateId']
        instanceId: CanvasNode['instanceId']
        options: CanvasNode['options']
      }>,
    ) {
      const { templateId, instanceId, options } = action.payload
      return templates.map((template) => {
        if (templateId == template.templateId) {
          return {
            ...template,
            nodeList: template.nodeList.map((node) => {
              if (node.instanceId == instanceId) {
                return {
                  ...node,
                  options,
                }
              }
              return node
            }),
          }
        }
        return template
      })
    },
    updateTextNodeSelection(
      templates: Template[],

      action: PayloadAction<{
        templateId: Template['templateId']
        instanceId: CanvasNode['instanceId']
        selection: Selection
      }>,
    ) {
      const { templateId, selection, instanceId } = action.payload

      return templates.map((template) => {
        if (template.templateId === templateId) {
          return {
            ...template,
            nodeList: template.nodeList.map((node) => {
              if (node.instanceId === instanceId) {
                return {
                  ...node,
                  options: {
                    ...node.options,
                    selection,
                  },
                }
              }
              return node
            }),
          }
        }
        return template
      })
    },
    updateAllTextNodeSelection(
      templates: Template[],
      action: PayloadAction<{ templateId: Template['templateId']; selection?: Selection }>,
    ) {
      const { templateId, selection = '999-999' } = action.payload
      for (const template of templates) {
        if (template.templateId === templateId) {
          for (const node of template.nodeList) {
            if (node.type === NodeType.TEXT) {
              ;(node.options as RenderTextOptions).selection = selection
            }
          }
        }
      }
    },
    //删除节点
    deleteNode(
      templates: Template[],
      action: PayloadAction<{
        templateId: Template['templateId']
        instanceId: CanvasNode['instanceId']
      }>,
    ) {
      const { instanceId, templateId } = action.payload
      return templates.map((template) => {
        if (template.templateId == templateId) {
          const propName = template.nodeList.find((node) => node.instanceId == instanceId)!.propName
          return {
            ...template,
            nodeList: template.nodeList.filter((node) => node.instanceId != instanceId),
            templateData: Object.keys(template.templateData)
              .filter((key) => key != propName)
              .reduce((pre, cur) => ({ ...pre, [cur]: template.templateData[cur] }), {}) as TemplateData,
          }
        }
        return template
      })
    },
    updateTextNodeHeightAdoptive(
      templates: Template[],
      action: PayloadAction<{
        templateId: Template['templateId']
        instanceIds: CanvasNode['instanceId'][]
        isAdoptive?: boolean
      }>,
    ) {
      const { templateId, instanceIds, isAdoptive = true } = action.payload
      for (const template of templates) {
        if (template.templateId === templateId) {
          for (const node of template.nodeList) {
            if (instanceIds.includes(node.instanceId)) {
              ;(node.options as RenderTextOptions).isAdoptiveHeight = isAdoptive
            }
          }
        }
      }
    },
  },
})

export const {
  resetTemplate, //重置整个模板：初次请求网络时
  updateTemplate, //更新整个模板信息
  patchTemplateNodeList, //向模板中加入节点，同时加入对应节点数据
  updateNodeActivation, //更改节点激活状态
  updateNodeStructure, //更改节点结构
  updateTemplateData, //更新模板装填数据
  updateNodeOptions, //更新节点样式
  deleteNode, //删除节点
  updateTextNodeSelection, //更新文本节点的selection
  updateAllTextNodeSelection,
  updateTextNodeHeightAdoptive,
} = TemplateSlice.actions

export default TemplateSlice.reducer
