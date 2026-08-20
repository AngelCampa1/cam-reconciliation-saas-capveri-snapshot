import { publicKnowledge } from '@/generated/public-knowledge'
import { helpTopics } from './guide-data'

const defaultTopicIds = [...publicKnowledge.appHelp.defaultRouteTopicIds]

const routeTopicMap = publicKnowledge.appHelp.routeHelp.map((route) => ({
  match: (pathname: string) => pathname.includes(route.routePattern),
  ids: [...route.topicIds],
}))

export function getContextualTopicIds(pathname: string): string[] {
  return (
    routeTopicMap.find((route) => route.match(pathname))?.ids ?? defaultTopicIds
  )
}

export function getContextualHelpTopics(pathname: string) {
  const ids = getContextualTopicIds(pathname)
  return ids
    .map((id) => helpTopics.find((topic) => topic.id === id))
    .filter((topic): topic is (typeof helpTopics)[number] => Boolean(topic))
}
