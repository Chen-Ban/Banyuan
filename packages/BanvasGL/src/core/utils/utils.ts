import { VIEWTYPE } from "@/constants"
import { CombinedView, View } from "../views"

// 查找方法
function findByType(view:View,type: VIEWTYPE): View[] {
    const results: View[] = []

    if(view.type === type){
        results.push(view)
    }
    if((view as CombinedView).isCombinedView()){
        results.push(...(view as CombinedView).content.map(v=>findByType(v,type)).flat())
    }
    
    return results
}

function findChildById(view:View,id: string): View | null {
    let result:View | null = null
    if (view.id === id) {
        return view
    }
    if((view as CombinedView).isCombinedView()){
        result = (view as CombinedView).content.filter(v=>findChildById(v,id))[0]
    }
    return result
}

export {
    findByType,
    findChildById
}